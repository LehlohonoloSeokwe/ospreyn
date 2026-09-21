/**
 * Ospreyn API server.
 *
 * This process serves the JSON API only. The frontend is a separate static
 * build deployed to Netlify. Nothing here serves HTML, and the API never
 * depends on Vite.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { apiRouter } from './routes';
import { verifyConnection, pool } from './db';
import { localStorageRouter } from './localStorage';
import { storageMode } from './storage';

const app = express();

// Render, Railway, Fly and Cloud Run all sit behind a proxy. Without this,
// req.ip and Secure cookies misbehave.
app.set('trust proxy', 1);

/**
 * Allowed browser origins. The Netlify production domain, any preview domains,
 * and localhost for development. Credentials are enabled because auth rides on
 * a cookie, and a wildcard origin is not permitted alongside credentials.
 */
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.APP_ORIGIN || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowNetlifyPreviews = process.env.ALLOW_NETLIFY_PREVIEWS !== 'false';

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and server-to-server requests send no Origin header.
      if (!origin) return callback(null, true);

      const normalised = origin.replace(/\/$/, '');

      if (allowedOrigins.includes(normalised)) return callback(null, true);

      if (
        process.env.NODE_ENV !== 'production' &&
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalised)
      ) {
        return callback(null, true);
      }

      // Netlify deploy previews: https://<hash>--<site>.netlify.app
      if (allowNetlifyPreviews && /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(normalised)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-org-id'],
    maxAge: 86400,
  }),
);

// Mounted before express.json() so the PUT handler can read the raw upload
// body itself, rather than have it consumed (and rejected as invalid JSON)
// by the global JSON parser below.
app.use('/api/local-storage', localStorageRouter);

app.use(express.json({ limit: '1mb' }));
// Twilio's WhatsApp webhook (POST /api/webhooks/whatsapp) sends
// application/x-www-form-urlencoded, not JSON. Safe to mount globally
// alongside express.json() above — each only parses requests matching its
// own Content-Type, so ordinary JSON API calls are unaffected.
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      service: 'ospreyn-api',
      version: '1.2',
      database: 'connected',
      storage: storageMode,
    });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'ospreyn-api', database: 'unreachable' });
  }
});

app.use('/api', apiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Hosts inject PORT. Binding to a hardcoded port is how deploys fail silently.
const PORT = Number(process.env.PORT || 3000);

async function start() {
  await verifyConnection();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ospreyn] API listening on 0.0.0.0:${PORT}`);
    if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'production') {
      console.warn(
        '[ospreyn] CORS_ORIGINS is empty. Set it to your Netlify domain or the browser will block every request.',
      );
    }
  });
}

start().catch((err) => {
  console.error('[ospreyn] failed to start:', err.message);
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    console.log(`[ospreyn] ${signal} received, closing pool`);
    await pool.end().catch(() => undefined);
    process.exit(0);
  });
}
