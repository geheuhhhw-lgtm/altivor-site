'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const { authLimiter } = require('./middleware/rateLimit');
const config = require('./config');

const app = express();

// ─── Bezpieczeństwo ────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: config.appUrl,
  credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

// ─── Health ────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ─── API Auth (rate limit na cały moduł auth) ───────────────────────────────

app.use('/api/auth', authRoutes);

// ─── 404 ───────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error handler ──────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[APP] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`ALTIVOR Auth API: http://localhost:${config.port}`);
});
