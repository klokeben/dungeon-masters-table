/* ============================================================
   THE DUNGEON MASTER'S TABLE — server

   In development this serves only /api and Vite serves the app.
   In production it serves both: the built frontend out of /dist
   and the API under /api, from one process on one URL.
   ============================================================ */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI, { toFile } from 'openai';

import {
  GENERATORS,
  generatorPrompt,
  SYNTHESIS_SYSTEM,
  synthesisUser,
  SHEET_SYSTEM,
  COMBAT_SYSTEM,
} from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

const PORT = process.env.PORT || 8787;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';

/* Leave APP_PASSWORD empty and the site is open to anyone with the link.
   Set it to any string and a lock screen appears — no redeploy of code needed. */
const APP_PASSWORD = (process.env.APP_PASSWORD || '').trim();

/* Guardrails so a public URL can't quietly drain your API credits. */
const RATE_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 25);
const DAILY_LIMIT = Number(process.env.DAILY_REQUEST_LIMIT || 1500);

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy; without this every IP looks the same
app.use(cors());
app.use(express.json({ limit: '32mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  // The browser slices long recordings before upload, so nothing legitimate
  // exceeds this. Keeping it modest protects a small server's memory.
  limits: { fileSize: 32 * 1024 * 1024 },
});

/* ---------- lazy clients so the server boots without keys ---------- */
let _anthropic = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error('ANTHROPIC_API_KEY is not set on the server.');
    e.status = 503;
    throw e;
  }
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

let _openai = null;
function openai() {
  if (!process.env.OPENAI_API_KEY) {
    const e = new Error('OPENAI_API_KEY is not set on the server.');
    e.status = 503;
    throw e;
  }
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/* ============================================================
   helpers
   ============================================================ */

/** Pull the first JSON object out of a model response, tolerating fences and preamble. */
function extractJson(text) {
  let t = (text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through to brace scanning */
  }
  const start = t.indexOf('{');
  if (start === -1) throw new Error('Model did not return JSON.');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1));
    }
  }
  throw new Error('Model returned truncated JSON. Try again, or shorten the input.');
}

/** One-shot JSON call to Claude, with an assistant prefill to keep it honest. */
async function askClaudeJson({ system, user, content, maxTokens = 6000, temperature = 1 }) {
  const msg = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [
      { role: 'user', content: content || user },
      { role: 'assistant', content: '{' },
    ],
  });
  const text = '{' + msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return { data: extractJson(text), usage: msg.usage };
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ============================================================
   public endpoints (no lock, no rate limit)
   ============================================================ */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    locked: Boolean(APP_PASSWORD),
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    whisper: Boolean(process.env.OPENAI_API_KEY),
    models: { claude: CLAUDE_MODEL, whisper: WHISPER_MODEL },
    generators: Object.entries(GENERATORS).map(([k, v]) => ({ kind: k, label: v.label })),
    budget: { usedToday: usage.count, dailyLimit: DAILY_LIMIT },
  });
});

app.post('/api/unlock', (req, res) => {
  if (!APP_PASSWORD) return res.json({ ok: true, locked: false });
  const given = String(req.body?.password || '');
  if (given === APP_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'That password is not right.' });
});

/* ============================================================
   gates
   ============================================================ */

/** Optional password. Off unless APP_PASSWORD is set in the environment. */
app.use('/api', (req, res, next) => {
  if (!APP_PASSWORD) return next();
  const given = req.get('x-app-password') || '';
  if (given === APP_PASSWORD) return next();
  res.status(401).json({ error: 'locked', locked: true });
});

/** Per-IP burst limit — a sliding one-minute window, kept in memory. */
const hits = new Map();
app.use('/api', (req, res, next) => {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  const window = hits.get(ip)?.filter((t) => now - t < 60_000) || [];

  if (window.length >= RATE_PER_MIN) {
    return res.status(429).json({
      error: `Too many requests in a row (limit ${RATE_PER_MIN}/minute). Wait a moment and try again.`,
    });
  }
  window.push(now);
  hits.set(ip, window);

  // Keep the map from growing forever on a long-running server.
  if (hits.size > 500) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k);
  }
  next();
});

/** Daily ceiling across everyone — the real backstop on a public URL. */
const usage = { day: new Date().toISOString().slice(0, 10), count: 0 };
app.use('/api', (req, res, next) => {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) {
    usage.day = today;
    usage.count = 0;
  }
  if (usage.count >= DAILY_LIMIT) {
    return res.status(429).json({
      error: `This site has hit its daily limit of ${DAILY_LIMIT} AI requests. It resets at midnight UTC.`,
    });
  }
  usage.count++;
  next();
});

/* ============================================================
   API
   ============================================================ */

/* ---------- 1. transcribe an audio chunk ---------- */
app.post(
  '/api/transcribe',
  upload.single('audio'),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio file received.' });

    // Trust the uploaded filename's extension when it has one; otherwise guess
    // from the MIME type. Whisper rejects files it can't identify.
    const ALLOWED = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'oga', 'flac'];
    const named = (req.file.originalname || '').split('.').pop()?.toLowerCase();
    const mime = req.file.mimetype || '';
    const ext = ALLOWED.includes(named)
      ? named
      : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3'
      : mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
      : mime.includes('ogg') ? 'ogg'
      : mime.includes('wav') ? 'wav'
      : mime.includes('flac') ? 'flac'
      : 'webm';

    const file = await toFile(req.file.buffer, `audio.${ext}`, {
      type: mime || 'audio/webm',
    });

    const result = await openai().audio.transcriptions.create({
      file,
      model: WHISPER_MODEL,
      // Nudge Whisper toward fantasy vocabulary and the actual names at this table.
      prompt: (req.body.vocabulary || '').slice(0, 800) ||
        'A Dungeons & Dragons session. Expect character names, spell names, and dice terminology.',
      language: req.body.language || 'en',
      response_format: 'json',
    });

    res.json({ text: (result.text || '').trim() });
  })
);

/* ---------- 2. synthesize session notes ---------- */
app.post(
  '/api/synthesize',
  asyncRoute(async (req, res) => {
    const { transcript, campaign, roster, glossary, previous } = req.body || {};
    if (!transcript || transcript.trim().length < 40) {
      return res.status(400).json({ error: 'Transcript is too short to synthesize.' });
    }
    const { data } = await askClaudeJson({
      system: SYNTHESIS_SYSTEM,
      user: synthesisUser({ transcript, campaign, roster, glossary, previous }),
      maxTokens: 8000,
      temperature: 0.6,
    });
    res.json(data);
  })
);

/* ---------- 3. improv generators ---------- */
app.post(
  '/api/generate',
  asyncRoute(async (req, res) => {
    const { kind, params } = req.body || {};
    if (!GENERATORS[kind]) {
      return res.status(400).json({ error: `Unknown generator "${kind}".` });
    }
    const { system, user } = generatorPrompt(kind, params || {});
    const { data } = await askClaudeJson({
      system,
      user,
      maxTokens: kind === 'dungeon' || kind === 'settlement' ? 8000 : 5000,
      temperature: 1,
    });
    res.json({ kind, params: params || {}, data });
  })
);

/* ---------- 4. parse an uploaded character sheet ---------- */
app.post(
  '/api/parse-sheet',
  upload.single('sheet'),
  asyncRoute(async (req, res) => {
    const blocks = [];

    if (req.file) {
      const mime = req.file.mimetype || '';
      const b64 = req.file.buffer.toString('base64');

      if (mime === 'application/pdf') {
        blocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: b64 },
        });
      } else if (mime.startsWith('image/')) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mime === 'image/jpg' ? 'image/jpeg' : mime,
            data: b64,
          },
        });
      } else {
        blocks.push({
          type: 'text',
          text: `Character sheet file "${req.file.originalname}":\n\n${req.file.buffer.toString('utf8').slice(0, 120000)}`,
        });
      }
    }

    if (req.body?.text) {
      blocks.push({ type: 'text', text: `Additional character details:\n\n${req.body.text}` });
    }

    if (!blocks.length) {
      return res.status(400).json({ error: 'Provide a character sheet file or some text.' });
    }

    blocks.push({
      type: 'text',
      text: 'Extract this character sheet into the JSON schema described in your instructions.',
    });

    const { data } = await askClaudeJson({
      system: SHEET_SYSTEM,
      content: blocks,
      maxTokens: 8000,
      temperature: 0.2,
    });
    res.json(data);
  })
);

/* ---------- 5. scan live transcript for HP changes ---------- */
app.post(
  '/api/combat-scan',
  asyncRoute(async (req, res) => {
    const { transcript, roster } = req.body || {};
    if (!transcript || transcript.trim().length < 12) return res.json({ events: [] });

    const rosterLines = (roster || [])
      .map((c) => `- ${c.name} — HP ${c.current}/${c.max}${c.temp ? ` (+${c.temp} temp)` : ''}${c.player ? `, played by ${c.player}` : ''}`)
      .join('\n');

    const { data } = await askClaudeJson({
      system: COMBAT_SYSTEM,
      user: `PARTY ROSTER:\n${rosterLines || '(no characters loaded)'}\n\nNEW TRANSCRIPT:\n${transcript}`,
      maxTokens: 1600,
      temperature: 0.1,
    });
    res.json({ events: Array.isArray(data.events) ? data.events : [] });
  })
);

/* ---------- 6. quick freeform ruling / lookup ---------- */
app.post(
  '/api/ask',
  asyncRoute(async (req, res) => {
    const { question, context } = req.body || {};
    if (!question) return res.status(400).json({ error: 'No question provided.' });

    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      temperature: 0.4,
      system: `You are a rules-savvy D&D 5e assistant sitting at the DM's elbow mid-session.
Answer in under 120 words. Lead with the ruling, then the page-level reasoning. If the rules are
ambiguous, say so and give the fastest fair table ruling. Never stall — the players are waiting.`,
      messages: [
        { role: 'user', content: context ? `Table context: ${context}\n\nQuestion: ${question}` : question },
      ],
    });
    res.json({ answer: msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('') });
  })
);

/* Anything else under /api is a genuine 404, not the app. */
app.use('/api', (req, res) => res.status(404).json({ error: `No such endpoint: ${req.path}` }));

/* ============================================================
   the app itself
   ============================================================ */

const built = fs.existsSync(path.join(DIST, 'index.html'));

if (built) {
  app.use(
    express.static(DIST, {
      // index.html must never be cached or people get a stale app after a deploy;
      // the hashed asset filenames underneath it can be cached hard.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        else if (filePath.includes(`${path.sep}assets${path.sep}`))
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  app.get('*', (req, res) =>
    res
      .status(503)
      .type('html')
      .send(
        `<pre style="font:16px/1.6 ui-monospace,monospace;padding:40px">
The app hasn't been built yet.

  For local development, run both halves:   npm run dev
  For a real deployment, build first:       npm run build && npm start
</pre>`
      )
  );
}

/* ============================================================
   errors + boot
   ============================================================ */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  const message =
    err.code === 'LIMIT_FILE_SIZE'
      ? 'That file is too large. Files over 24 MB are normally split automatically — try again, or split it yourself.'
      : err.message || 'Something went wrong.';
  console.error(`[error ${status}]`, err.message);
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  const tick = (b) => (b ? '✔' : '✘');
  console.log(`\n  ⚔  The Dungeon Master's Table — listening on :${PORT}`);
  console.log(`     ${tick(process.env.ANTHROPIC_API_KEY)} Claude   (${CLAUDE_MODEL})`);
  console.log(`     ${tick(process.env.OPENAI_API_KEY)} Whisper  (${WHISPER_MODEL})`);
  console.log(`     ${tick(built)} Frontend ${built ? 'served from /dist' : 'not built — run npm run build'}`);
  console.log(`     ${APP_PASSWORD ? '🔒 password required' : '🔓 open to anyone with the link'}`);
  console.log(`     limits: ${RATE_PER_MIN}/min per visitor, ${DAILY_LIMIT}/day total\n`);
});
