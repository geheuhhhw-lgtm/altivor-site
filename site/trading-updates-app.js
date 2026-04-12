'use strict';

/* ─── ALTIVOR Trading Updates Feed ────────────────────────────────────────
   Fetches live financial news via the local ALTIVOR news proxy endpoint.
   Falls back to curated static articles if fetch fails.
   Primary data source: TradingView News Flow (tradingview.com/news-flow)
   Wire services: Reuters, CNBC, MarketWatch, FXStreet, CoinDesk, Investing.com
   ──────────────────────────────────────────────────────────────────────── */

var TradingUpdates = (function () {

  /* ── Source registry ───────────────────────────────────────────────── */
  var SOURCES = [
    {
      id: 'cnbc-markets',
      label: 'CNBC Markets',
      tag: 'equities',
      rss: 'https://www.cnbc.com/id/20910258/device/rss/rss.html'
    },
    {
      id: 'cnbc-economy',
      label: 'CNBC Economy',
      tag: 'macro',
      rss: 'https://www.cnbc.com/id/20910263/device/rss/rss.html'
    },
    {
      id: 'cnbc-finance',
      label: 'CNBC Finance',
      tag: 'macro',
      rss: 'https://www.cnbc.com/id/10000664/device/rss/rss.html'
    },
    {
      id: 'marketwatch',
      label: 'MarketWatch',
      tag: 'equities',
      rss: 'https://feeds.marketwatch.com/marketwatch/topstories/'
    },
    {
      id: 'marketwatch-real',
      label: 'MarketWatch',
      tag: 'equities',
      rss: 'https://feeds.marketwatch.com/marketwatch/realtimeheadlines/'
    },
    {
      id: 'fxstreet',
      label: 'FXStreet',
      tag: 'forex',
      rss: 'https://www.fxstreet.com/rss/news'
    },
    {
      id: 'fxstreet-analysis',
      label: 'FXStreet',
      tag: 'forex',
      rss: 'https://www.fxstreet.com/rss/analysis'
    },
    {
      id: 'coindesk',
      label: 'CoinDesk',
      tag: 'crypto',
      rss: 'https://www.coindesk.com/arc/outboundfeeds/rss/'
    },
    {
      id: 'cointelegraph',
      label: 'CoinTelegraph',
      tag: 'crypto',
      rss: 'https://cointelegraph.com/rss'
    },
    {
      id: 'investing-news',
      label: 'Investing.com',
      tag: 'macro',
      rss: 'https://www.investing.com/rss/news.rss'
    },
    {
      id: 'investing-commodities',
      label: 'Investing.com',
      tag: 'commodities',
      rss: 'https://www.investing.com/rss/news_1.rss'
    },
    {
      id: 'investing-forex',
      label: 'Investing.com',
      tag: 'forex',
      rss: 'https://www.investing.com/rss/news_2.rss'
    }
  ];

  var API_ENDPOINT = '/api/trading-updates';
  var REFRESH_INTERVAL_MS = 30 * 1000; /* 30 seconds */

  /* ── State ─────────────────────────────────────────────────────────── */
  var allArticles = [];
  var activeFilter = 'all';
  var activeSource = 'all';
  var searchQuery = '';
  var isLoading = false;
  var lastFetch = null;
  var latestArticleAt = null;
  var refreshTimer = null;
  var DEFAULT_SOURCE_ID = '__tradingview__';
  var ALTIVOR_FEED_ID = '__altivor_feed__';

  /* ── DOM refs ───────────────────────────────────────────────────────── */
  var feedEl, skeletonEl, emptyEl, countEl, lastUpdatedEl, refreshBtn, sourceSelectEl, liveIndicatorEl, liveLabelEl;

  /* ── Fallback static articles ───────────────────────────────────────── */
  function currentLang() {
    return document.documentElement.lang || 'en';
  }

  function t(key, fallback) {
    var translations = window.__ALTIVOR_TRANSLATIONS || {};
    var lang = currentLang();
    var dict = translations[lang] || translations.en || {};
    return dict[key] !== undefined ? dict[key] : fallback;
  }

  function buildFallbackArticles() {
    return [
      {
        title: t('upd_fallback_title', 'TradingView live feed temporarily unavailable'),
        description: t('upd_fallback_description', 'The live TradingView refresh could not complete. Please retry shortly or open TradingView News Flow directly.'),
        link: 'https://www.tradingview.com/news-flow/',
        pubDate: new Date().toISOString(),
        source: ALTIVOR_FEED_ID,
        tag: 'macro',
        image: null,
        via: DEFAULT_SOURCE_ID,
        isFallback: true
      }
    ];
  }

  /* ── Utilities ─────────────────────────────────────────────────────── */
  function timeAgo(dateStr) {
    var now = Date.now();
    var then = new Date(dateStr).getTime();
    if (!then || isNaN(then)) return '';
    var diff = Math.max(0, Math.floor((now - then) / 1000));
    if (diff < 60) return t('upd_time_seconds_ago', '{n}s ago').replace('{n}', diff);
    if (diff < 3600) return t('upd_time_minutes_ago', '{n}m ago').replace('{n}', Math.floor(diff / 60));
    if (diff < 86400) return t('upd_time_hours_ago', '{n}h ago').replace('{n}', Math.floor(diff / 3600));
    return t('upd_time_days_ago', '{n}d ago').replace('{n}', Math.floor(diff / 86400));
  }

  function formatClock(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(currentLang(), {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
  }

  function truncate(str, max) {
    if (!str) return '';
    str = stripHtml(str);
    return str.length > max ? str.slice(0, max).replace(/\s+\S*$/, '') + '…' : str;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function sourceLabel(source) {
    if (source === ALTIVOR_FEED_ID) return t('upd_source_altivor_feed', 'ALTIVOR Feed');
    if (source === DEFAULT_SOURCE_ID || !source) return t('upd_source_tradingview', 'TradingView');
    return source;
  }

  function viaLabel(via) {
    if (via === ALTIVOR_FEED_ID) return t('upd_source_altivor_feed', 'ALTIVOR Feed');
    if (via === DEFAULT_SOURCE_ID || !via) return t('upd_via_tradingview', 'TradingView News Flow');
    return via;
  }

  function tagLabel(tag) {
    var map = {
      macro: t('upd_filter_macro', 'Macro'),
      equities: t('upd_filter_equities', 'Equities'),
      forex: t('upd_filter_forex', 'Forex'),
      commodities: t('upd_filter_commodities', 'Commodities'),
      crypto: t('upd_filter_crypto', 'Crypto')
    };
    return map[tag] || tag;
  }

  function setLiveState(state) {
    if (liveIndicatorEl) liveIndicatorEl.setAttribute('data-state', state);
    if (!liveLabelEl) return;
    if (state === 'live') {
      liveLabelEl.textContent = t('upd_status_live', 'Live');
      return;
    }
    if (state === 'delayed') {
      liveLabelEl.textContent = t('upd_status_delayed', 'Delayed');
      return;
    }
    liveLabelEl.textContent = t('upd_status_syncing', 'Syncing');
  }

  function updateLiveState() {
    if (isLoading) {
      setLiveState('syncing');
      return;
    }
    if (!allArticles.length || allArticles.every(function (article) { return article && article.isFallback; })) {
      setLiveState('delayed');
      return;
    }
    if (latestArticleAt && !isNaN(latestArticleAt.getTime()) && (Date.now() - latestArticleAt.getTime()) > (20 * 60 * 1000)) {
      setLiveState('delayed');
      return;
    }
    setLiveState('live');
  }

  function maybeRefreshOnAttention() {
    if (isLoading) return;
    if (!lastFetch || (Date.now() - lastFetch.getTime()) >= Math.max(5000, Math.floor(REFRESH_INTERVAL_MS / 2))) {
      fetchAll(true);
    }
  }

  function populateSourceOptions() {
    if (!sourceSelectEl) return;
    var current = activeSource;
    var sources = [];
    allArticles.forEach(function (article) {
      var source = article.source || DEFAULT_SOURCE_ID;
      if (!source || sources.indexOf(source) !== -1) return;
      sources.push(source);
    });
    sources.sort(function (a, b) {
      return sourceLabel(a).localeCompare(sourceLabel(b));
    });
    sourceSelectEl.innerHTML = ['<option value="all">' + escapeHtml(t('upd_all_sources', 'All Sources (via TradingView)')) + '</option>']
      .concat(sources.map(function (source) {
        var safeValue = escapeHtml(source);
        var safeLabel = escapeHtml(sourceLabel(source));
        return '<option value="' + safeValue + '">' + safeLabel + '</option>';
      }))
      .join('');
    if (current !== 'all' && sources.indexOf(current) !== -1) {
      sourceSelectEl.value = current;
    } else {
      activeSource = 'all';
      sourceSelectEl.value = 'all';
    }
  }

  /* ── Fetch all sources ──────────────────────────────────────────────── */
  function fetchAll(forceRefresh) {
    if (isLoading) return;
    isLoading = true;
    setLoading(true);
    var url = API_ENDPOINT + (forceRefresh ? '?refresh=1' : '');

    fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Feed request failed');
        return r.json();
      })
      .then(function (data) {
        var articles = Array.isArray(data.articles) ? data.articles : [];

        if (!articles.length) {
          articles = buildFallbackArticles();
        }

        articles = articles.map(function (item) {
          return {
            title: stripHtml(item.title) || '',
            description: truncate(item.description || '', 220),
            link: item.link || '#',
            pubDate: item.pubDate || new Date().toISOString(),
            source: item.source || DEFAULT_SOURCE_ID,
            tag: item.tag || 'macro',
            image: item.image || null,
            via: item.via || DEFAULT_SOURCE_ID,
            isFallback: !!item.isFallback
          };
        });

        articles.sort(function (a, b) {
          return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
        });

        allArticles = articles;
        lastFetch = data.updatedAt ? new Date(data.updatedAt) : new Date();
        latestArticleAt = articles.length ? new Date(articles[0].pubDate) : null;
        populateSourceOptions();
      })
      .catch(function () {
        allArticles = buildFallbackArticles();
        lastFetch = new Date();
        latestArticleAt = allArticles.length ? new Date(allArticles[0].pubDate) : null;
        populateSourceOptions();
      })
      .finally(function () {
        isLoading = false;
        setLoading(false);
        render();
        updateLastUpdated();
        updateLiveState();
        scheduleRefresh();
      });
  }

  /* ── Filter & search ────────────────────────────────────────────────── */
  function filtered() {
    return allArticles.filter(function (a) {
      var tagOk = activeFilter === 'all' || a.tag === activeFilter;
      var srcOk = activeSource === 'all' || a.source === activeSource;
      var q = searchQuery.toLowerCase().trim();
      var searchOk = !q || a.title.toLowerCase().indexOf(q) !== -1 || a.description.toLowerCase().indexOf(q) !== -1;
      return tagOk && srcOk && searchOk;
    });
  }

  /* ── Render feed ────────────────────────────────────────────────────── */
  function render() {
    if (!feedEl) return;
    var articles = filtered();

    if (countEl) countEl.textContent = articles.length;

    if (articles.length === 0) {
      feedEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    feedEl.innerHTML = articles.map(function (a, i) {
      var featured = i === 0 && activeFilter === 'all' && activeSource === 'all' && !searchQuery;
      return buildCard(a, featured);
    }).join('');
  }

  function buildCard(a, featured) {
    var ago = timeAgo(a.pubDate);
    var tagCls = 'upd-tag upd-tag--' + a.tag;
    var imgHtml = '';
    var source = sourceLabel(a.source);
    var via = viaLabel(a.via);
    if (featured && a.image) {
      imgHtml = '<div class="upd-card-img"><img src="' + a.image + '" alt="" loading="lazy" onerror="this.closest(\'.upd-card-img\').style.display=\'none\'" /></div>';
    }
    return '<a href="' + a.link + '" class="upd-card' + (featured ? ' upd-card--featured' : '') + '" target="_blank" rel="noopener noreferrer">'
      + imgHtml
      + '<div class="upd-card-body">'
      + '<div class="upd-card-meta">'
      + '<span class="' + tagCls + '">' + tagLabel(a.tag) + '</span>'
      + '<span class="upd-card-source">' + escapeHtml(source) + '</span>'
      + '<span class="upd-card-time">' + ago + '</span>'
      + '</div>'
      + '<h3 class="upd-card-title">' + a.title + '</h3>'
      + (a.description ? '<p class="upd-card-desc">' + a.description + '</p>' : '')
      + '<div class="upd-card-footer">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
      + '<span>' + escapeHtml(t('upd_read_full_article', 'Read full article')) + '</span>'
      + '<span class="upd-card-via">' + escapeHtml(t('upd_via_prefix', 'via {source}').replace('{source}', via)) + '</span>'
      + '</div>'
      + '</div>'
      + '</a>';
  }

  /* ── Loading skeleton ───────────────────────────────────────────────── */
  function setLoading(on) {
    if (!feedEl || !skeletonEl) return;
    if (on) {
      feedEl.style.display = 'none';
      skeletonEl.style.display = '';
    } else {
      skeletonEl.style.display = 'none';
      feedEl.style.display = '';
    }
    if (refreshBtn) {
      refreshBtn.disabled = on;
      refreshBtn.classList.toggle('upd-refreshing', on);
    }
    updateLiveState();
  }

  function updateLastUpdated() {
    if (!lastUpdatedEl) return;
    if (!lastFetch) {
      lastUpdatedEl.innerHTML = t('upd_fetching', 'Fetching&hellip;');
      return;
    }
    var text = t('upd_synced_at', 'Synced {time}').replace('{time}', formatClock(lastFetch));
    if (latestArticleAt && !isNaN(latestArticleAt.getTime())) {
      text += ' · ' + t('upd_latest_headline', 'Latest headline {time}').replace('{time}', timeAgo(latestArticleAt.toISOString()));
    }
    lastUpdatedEl.textContent = text;
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      isLoading = false;
      fetchAll();
    }, REFRESH_INTERVAL_MS);
  }

  /* ── Init ───────────────────────────────────────────────────────────── */
  function init() {
    feedEl = document.getElementById('updFeed');
    skeletonEl = document.getElementById('updSkeleton');
    emptyEl = document.getElementById('updEmpty');
    countEl = document.getElementById('updCount');
    lastUpdatedEl = document.getElementById('updLastUpdated');
    refreshBtn = document.getElementById('updRefreshBtn');
    sourceSelectEl = document.getElementById('updSourceSelect');
    liveIndicatorEl = document.getElementById('updLiveIndicator');
    liveLabelEl = document.getElementById('updLiveLabel');

    if (!feedEl) return;

    /* Filter tabs */
    var filterBar = document.getElementById('updFilters');
    if (filterBar) {
      filterBar.addEventListener('click', function (e) {
        var btn = e.target.closest('.upd-filter-btn');
        if (!btn) return;
        activeFilter = btn.dataset.filter;
        filterBar.querySelectorAll('.upd-filter-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        render();
      });
    }

    /* Source select */
    if (sourceSelectEl) {
      sourceSelectEl.addEventListener('change', function () {
        activeSource = sourceSelectEl.value;
        render();
      });
    }

    document.addEventListener('altivor:languagechange', function () {
      allArticles = allArticles.map(function (article) {
        if (!article || !article.isFallback) return article;
        var fallback = buildFallbackArticles()[0];
        fallback.pubDate = article.pubDate || fallback.pubDate;
        return fallback;
      });
      populateSourceOptions();
      render();
      updateLastUpdated();
      updateLiveState();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        maybeRefreshOnAttention();
      }
    });

    window.addEventListener('focus', maybeRefreshOnAttention);
    window.addEventListener('online', function () {
      fetchAll(true);
    });

    /* Search */
    var searchInput = document.getElementById('updSearch');
    if (searchInput) {
      var searchTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          searchQuery = searchInput.value;
          render();
        }, 280);
      });
    }

    /* Refresh button */
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        isLoading = false;
        fetchAll(true);
      });
    }

    fetchAll(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { refresh: function () { isLoading = false; fetchAll(true); } };

})();
