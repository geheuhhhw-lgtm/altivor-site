'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { maybeHandleAuthRoute } = require('./server-auth-routes');
const { maybeHandleAdminApiRoute } = require('./server-admin-routes');
const { maybeHandleChallengeRoute } = require('./server-challenge-routes');
const { maybeHandleAdminChallengeRoute } = require('./server-admin-challenge-routes');
const { getAuthenticatedUser, isAdminUser } = require('./auth-store');

const PORT = process.env.PORT || 8090;
const ROOT = __dirname;
const API_CACHE_MS = 15 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_ARTICLES = 48;
const MAX_DETAIL_REQUESTS = 8;
const TRADINGVIEW_BASE_URL = 'https://www.tradingview.com';
const TRADINGVIEW_NEWS_FLOW_URL = `${TRADINGVIEW_BASE_URL}/news-flow/`;
const TRADINGVIEW_NEWS_OVERVIEW_URL = `${TRADINGVIEW_BASE_URL}/news/`;
const PRIVATE_PATHS = new Set([
  '/server.js',
  '/auth-store.js',
  '/server-auth-routes.js',
  '/server-admin-routes.js',
  '/server-challenge-routes.js',
  '/server-admin-challenge-routes.js',
  '/challenge-store.js',
  '/statement-parser.js',
  '/verification-service.js',
  '/email-service.js',
  '/package.json',
  '/.env',
  '/.env.example'
]);
const PRIVATE_PREFIXES = ['/data/'];

const FALLBACK = [
  {
    title: 'TradingView live news feed temporarily unavailable',
    description: 'The live TradingView refresh could not complete. Retry shortly or open TradingView News Flow directly.',
    link: 'https://www.tradingview.com/news-flow/',
    pubDate: new Date().toISOString(),
    source: 'ALTIVOR Feed',
    tag: 'macro',
    image: null,
    via: 'TradingView News Flow'
  }
];

const cache = {
  payload: null,
  fetchedAt: 0,
  inflight: null
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(Number(code));
      } catch (_) {
        return '';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16));
      } catch (_) {
        return '';
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max).replace(/\s+\S*$/, '') + '…' : str;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function absoluteUrl(raw, baseUrl = TRADINGVIEW_BASE_URL) {
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch (_) {
    return raw;
  }
}

function fetchText(targetUrl) {
  return new Promise((resolve, reject) => {
    const transport = targetUrl.startsWith('https://') ? https : http;
    const req = transport.get(targetUrl, {
      headers: {
        'User-Agent': 'ALTIVORNewsProxy/1.0 (+https://www.tradingview.com/news-flow/)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const redirected = new URL(res.headers.location, targetUrl).toString();
        resolve(fetchText(redirected));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function extractMetaContent(html, attributeName, attributeValue) {
  const attr = escapeRegex(attributeName);
  const value = escapeRegex(attributeValue);
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${value}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return '';
}

function classifyTag(article) {
  const text = `${article.title || ''} ${article.description || ''} ${article.source || ''}`.toLowerCase();
  if (/\b(bitcoin|btc|ethereum|eth|crypto|cryptocurrency|blockchain|token|solana|xrp|dogecoin)\b/.test(text)) return 'crypto';
  if (/\b(gold|silver|oil|crude|wti|brent|natural gas|gasoline|copper|commodity|commodities)\b/.test(text)) return 'commodities';
  if (/\b(forex|fx|eur\/usd|usd\/jpy|gbp\/usd|usd\/cad|aud\/usd|nzd\/usd|usd\/chf|dxy|yen|euro|sterling|dollar index|currency|currencies)\b/.test(text)) return 'forex';
  if (/\b(cpi|ppi|pmi|gdp|nfp|payrolls|inflation|interest rate|rates|rate cut|rate hike|fed|federal reserve|ecb|boe|boj|central bank|treasury|jobs|unemployment|labor|macro|economic|economy)\b/.test(text)) return 'macro';
  return 'equities';
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = (article.link || '') + '|' + (article.title || '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toTitleCase(str) {
  return String(str || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferSourceFromHref(href) {
  const match = String(href || '').match(/\/news\/([^,/:]+(?:\.[^,/:]+)?)/i);
  if (!match) return '';
  const normalized = match[1]
    .replace(/\.(com|net|org|co|io|biz)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  if (normalized === 'tradingview') return 'TradingView';
  return toTitleCase(normalized);
}

function parseOverviewCards(html) {
  const articles = [];
  const pattern = /<a href=["'](\/news\/[^"']+)["'][^>]*>\s*<article[^>]*data-qa-id=["']news-headline-card["'][\s\S]*?<\/article>\s*<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const block = match[0];
    const href = decodeHtml(match[1]);
    const inferredSource = inferSourceFromHref(href);
    const timeMatch = block.match(/<relative-time[^>]*event-time="([^"]+)"/i)
      || block.match(/<time[^>]*dateTime="([^"]+)"/i);
    const sourceMatch = block.match(/<\/(?:relative-time|time)><\/span>\s*<span>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>\s*<\/span>/i);
    const titleMatch = block.match(/data-qa-id="news-headline-title"[^>]*>([\s\S]*?)<\/div>/i);
    const title = decodeHtml(titleMatch ? titleMatch[1] : '');
    if (!title || /^sign in to read exclusive news$/i.test(title)) continue;
    const pubDateRaw = decodeHtml(timeMatch ? timeMatch[1] : '') || new Date().toISOString();
    const pubDate = isNaN(new Date(pubDateRaw).getTime()) ? new Date().toISOString() : new Date(pubDateRaw).toISOString();
    articles.push({
      title,
      description: '',
      link: absoluteUrl(href),
      pubDate,
      source: decodeHtml(sourceMatch ? sourceMatch[1] : '') || inferredSource || 'TradingView',
      tag: 'macro',
      image: null,
      via: 'TradingView News Flow'
    });
  }
  return dedupeArticles(articles).sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

async function fetchOverviewFeed() {
  let lastError = null;
  for (const sourceUrl of [TRADINGVIEW_NEWS_FLOW_URL, TRADINGVIEW_NEWS_OVERVIEW_URL]) {
    try {
      const overviewHtml = await fetchText(sourceUrl);
      const articles = parseOverviewCards(overviewHtml);
      if (articles.length) {
        return { articles, sourceUrl };
      }
      lastError = new Error(`TradingView overview parse returned no articles for ${sourceUrl}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('TradingView news overview parse returned no articles');
}

async function fetchArticleDetail(article) {
  const html = await fetchText(article.link);
  const title = extractMetaContent(html, 'property', 'og:title') || article.title;
  const description = extractMetaContent(html, 'property', 'og:description') || extractMetaContent(html, 'name', 'description');
  return {
    ...article,
    title: decodeHtml(title.replace(/\s+—\s+TradingView News$/i, '')),
    description: truncate(description, 220),
    image: absoluteUrl(extractMetaContent(html, 'property', 'og:image'), article.link),
    tag: classifyTag({ title, description, source: article.source }),
    via: 'TradingView News Flow'
  };
}

async function buildFeed() {
  const overview = await fetchOverviewFeed();
  let articles = overview.articles;
  const articlesWithDetails = articles.slice(0, MAX_DETAIL_REQUESTS);
  const detailResults = await Promise.allSettled(articlesWithDetails.map(fetchArticleDetail));
  const enrichedLead = articlesWithDetails.map((article, index) => {
    const result = detailResults[index];
    if (result && result.status === 'fulfilled') return result.value;
    return { ...article, tag: classifyTag(article) };
  });
  const enrichedTail = articles.slice(MAX_DETAIL_REQUESTS).map((article) => ({
    ...article,
    tag: classifyTag(article)
  }));
  articles = dedupeArticles(enrichedLead.concat(enrichedTail))
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, MAX_ARTICLES);
  if (!articles.length) articles = FALLBACK;

  return {
    updatedAt: new Date().toISOString(),
    sourceUrl: overview.sourceUrl,
    count: articles.length,
    articles
  };
}

async function getFeedPayload(forceRefresh) {
  const fresh = cache.payload && (Date.now() - cache.fetchedAt) < API_CACHE_MS;
  if (!forceRefresh && fresh) return cache.payload;
  if (cache.inflight) return cache.inflight;

  cache.inflight = buildFeed()
    .then((payload) => {
      cache.payload = payload;
      cache.fetchedAt = Date.now();
      cache.inflight = null;
      return payload;
    })
    .catch((error) => {
      cache.inflight = null;
      if (cache.payload) return cache.payload;
      return {
        updatedAt: new Date().toISOString(),
        sourceUrl: TRADINGVIEW_NEWS_FLOW_URL,
        count: FALLBACK.length,
        articles: FALLBACK,
        error: error.message
      };
    });

  return cache.inflight;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function isPrivatePath(pathname) {
  const normalized = String(pathname || '').replace(/\\/g, '/');
  if (PRIVATE_PATHS.has(normalized)) return true;
  return PRIVATE_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

function safePathname(urlPath) {
  let pathname = decodeURIComponent(urlPath.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const normalized = path.normalize(path.join(ROOT, pathname));
  if (!normalized.startsWith(ROOT)) return null;
  return normalized;
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);

    if (isPrivatePath(reqUrl.pathname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (await maybeHandleAuthRoute(req, res, reqUrl)) {
      return;
    }

    if (await maybeHandleAdminApiRoute(req, res, reqUrl)) {
      return;
    }

    if (await maybeHandleChallengeRoute(req, res, reqUrl)) {
      return;
    }

    if (await maybeHandleAdminChallengeRoute(req, res, reqUrl)) {
      return;
    }

    if (reqUrl.pathname === '/api/trading-updates') {
      const forceRefresh = reqUrl.searchParams.get('refresh') === '1';
      const payload = await getFeedPayload(forceRefresh);
      sendJson(res, 200, payload);
      return;
    }

    // Protect admin UI paths (e.g. /admin.html, /admin/) — require authenticated admin
    const pathLower = reqUrl.pathname.toLowerCase().replace(/\/$/, '') || '/';
    if (pathLower === '/admin' || pathLower === '/admin.html' || pathLower.startsWith('/admin/')) {
      const user = getAuthenticatedUser(req);
      if (!user || !isAdminUser(user)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
    }

    const filePath = safePathname(reqUrl.pathname);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    serveFile(req, res, filePath);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`ALTIVOR server running at http://localhost:${PORT}`);
});
