import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { loadUser } from './auth.ts';
import { UPLOAD_DIR } from './db.ts';
import { privacyPage, publicConfig, termsPage } from './legal.ts';
import { initRealtime } from './realtime.ts';
import { router as authRoutes } from './routes/auth.ts';
import { findInvite, router as chatRoutes } from './routes/chats.ts';
import { router as communityRoutes } from './routes/community.ts';
import { router as connectRoutes } from './routes/connect.ts';
import { router as messageRoutes } from './routes/messages.ts';
import { router as miscRoutes } from './routes/misc.ts';
import { router as translateRoutes } from './routes/translate.ts';
import { seed } from './seed.ts';
import { startSmtp } from './smtp.ts';
import { HttpError, escapeHtml } from './util.ts';

const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production';
const WEB_DIR = path.resolve(process.env.WEB_DIR || 'dist/web');

const AI_HOSTS = [
  'https://api.anthropic.com',
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
  'https://api.mistral.ai',
  'https://openrouter.ai',
];

export const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy (Render, Fly, Railway, nginx…) so that req.secure / req.ip are right.
if (process.env.TRUST_PROXY !== '0') app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:'],
        // 'self' plus the AI services a person may plug in with their own key: those calls
        // go straight from their browser to the provider, never through this server.
        'connect-src': ["'self'", 'ws:', 'wss:', ...AI_HOSTS, ...(process.env.CSP_CONNECT_EXTRA || '').split(/[\s,]+/).filter(Boolean)],
        'style-src': ["'self'", "'unsafe-inline'"],
        'upgrade-insecure-requests': null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
// The iOS and Android apps load their interface from the device, so their requests are
// cross-origin. They authenticate with a bearer token, never with cookies, which is why
// no "Allow-Credentials" header is sent here.
const APP_ORIGINS = (process.env.CORS_ORIGINS || 'capacitor://localhost,ionic://localhost,https://localhost,http://localhost')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && APP_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-OlimTalk-Client');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
  }
  next();
});
app.use(compression());
app.use(express.json({ limit: '200kb' }));

// ── uploads: served inertly, never as an active document ──
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    index: false,
    maxAge: '365d',
    immutable: true,
    setHeaders(res, file) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (!/\.(jpe?g|png|webp|gif|mp4|webm|mov|weba|ogg|mp3|m4a|wav)$/i.test(file)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  }),
);

// ── API ──
const api = express.Router();
api.use(loadUser);
api.get('/health', (_req, res) => res.json({ ok: true }));
api.get('/config', (_req, res) => res.json(publicConfig()));
api.use(authRoutes, chatRoutes, messageRoutes, communityRoutes, connectRoutes, translateRoutes, miscRoutes);
api.use((_req, _res, next) => next(new HttpError(404, 'not_found')));
app.use('/api', api);

// ── web app (production build) with link previews for invite links ──
const indexFile = path.join(WEB_DIR, 'index.html');
let indexHtml: string | null = null;
function loadIndex(): string | null {
  if (indexHtml && PROD) return indexHtml;
  try {
    indexHtml = fs.readFileSync(indexFile, 'utf8');
  } catch {
    indexHtml = null;
  }
  return indexHtml;
}

const OG_DEFAULT = {
  title: 'OlimTalk — la messagerie ouverte des olim',
  description:
    'Public groups, communities, stories and an integration guide for olim in Israel — in French, English, Spanish and Russian.',
};

function renderIndex(req: Request, og: { title: string; description: string }): string | null {
  const html = loadIndex();
  if (!html) return null;
  const origin = process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
  const tags = [
    `<title>${escapeHtml(og.title)}</title>`,
    `<meta name="description" content="${escapeHtml(og.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="OlimTalk">`,
    `<meta property="og:title" content="${escapeHtml(og.title)}">`,
    `<meta property="og:description" content="${escapeHtml(og.description)}">`,
    `<meta property="og:url" content="${escapeHtml(origin + req.path)}">`,
    `<meta property="og:image" content="${escapeHtml(origin)}/og.jpg">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n    ');
  return html.replace(/<title>.*?<\/title>/s, tags);
}

const withCount = (members: number, text: string) => `${members > 0 ? `${members} 👥 — ` : ''}${text}`.slice(0, 280);

app.use(express.static(WEB_DIR, { index: false, maxAge: PROD ? '1h' : 0 }));

// Required by the App Store and Google Play: a public privacy policy and the community rules.
app.get('/privacy', (_req, res) => void res.type('html').send(privacyPage()));
app.get('/terms', (_req, res) => void res.type('html').send(termsPage()));

app.get('/join/:code', (req, res, next) => {
  const found = findInvite(String(req.params.code));
  let og = OG_DEFAULT;
  if (found.chat) {
    og = {
      title: `${found.chat.emoji} ${found.chat.name} · OlimTalk`,
      description: withCount(found.chat.member_count, found.chat.description),
    };
  } else if (found.community) {
    og = {
      title: `${found.community.emoji} ${found.community.name} · OlimTalk`,
      description: withCount(found.community.member_count, found.community.description),
    };
  }
  const html = renderIndex(req, og);
  if (!html) return next();
  res.type('html').send(html);
});

app.get(/^\/(?!api\/|uploads\/|socket\.io\/|assets\/).*/, (req, res, next) => {
  if (req.method !== 'GET' || path.extname(req.path)) return next();
  const html = renderIndex(req, OG_DEFAULT);
  if (!html) return next();
  res.type('html').send(html);
});

// ── errors ──
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  const e = err as { status?: number; type?: string; message?: string };
  if (e?.type === 'entity.parse.failed' || e?.type === 'entity.too.large') {
    res.status(e.status ?? 400).json({ error: 'invalid_body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

const created = seed();
if (created) console.log(`[olimtalk] seeded ${created} built-in groups and communities`);

export const server = http.createServer(app);
initRealtime(server, APP_ORIGINS);

export const smtp = process.env.SMTP_PORT ? startSmtp(Number(process.env.SMTP_PORT)) : null;

if (process.env.OLIMTALK_NO_LISTEN !== '1') {
  server.listen(PORT, () => console.log(`[olimtalk] listening on http://localhost:${PORT} (${PROD ? 'production' : 'development'})`));
}
