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
import { ALL_PADS, PAD_BY_KEY, DURATION_FILTER } from './soundpacks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

const PORT = process.env.PORT || 8787;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

/* gpt-transcribe replaced whisper-1 as OpenAI's transcription model — it is
   markedly more accurate on noisy, multi-speaker audio, which is exactly what
   a table of six people shouting over each other is. whisper-1 still works if
   you set TRANSCRIBE_MODEL back to it. */
const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || process.env.WHISPER_MODEL || 'gpt-transcribe';

/* Optional third key: real recorded audio for the soundboard instead of
   synthesized tones. Free, no credit card. Without it the board falls back
   to synthesis and still works. */
const FREESOUND_KEY = (process.env.FREESOUND_API_KEY || '').trim();

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
  let msg;
  try {
    msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [
        { role: 'user', content: content || user },
        { role: 'assistant', content: '{' },
      ],
    });
  } catch (e) {
    throw humanize(e, 'anthropic');
  }
  const text = '{' + msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return { data: extractJson(text), usage: msg.usage };
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Upstream APIs return accurate but unhelpful errors. A DM mid-session needs to
 * know what to actually do, so translate the common ones into instructions.
 */
function humanize(err, service) {
  const status = err?.status || err?.statusCode;
  const raw = String(err?.message || '');
  const code = err?.error?.error?.code || err?.error?.code || '';
  const where = service === 'openai' ? 'OpenAI' : 'Anthropic';
  const billing =
    service === 'openai'
      ? 'https://platform.openai.com/settings/organization/billing'
      : 'https://console.anthropic.com/settings/billing';

  if (status === 401 || /invalid[_ ]api[_ ]key|incorrect api key/i.test(raw)) {
    const e = new Error(
      `The ${where} key on the server isn't being accepted. Check it was pasted whole, with no spaces at either end, then redeploy.`
    );
    e.status = 401;
    return e;
  }
  if (code === 'insufficient_quota' || /quota|billing hard limit|credit balance/i.test(raw)) {
    const e = new Error(
      `Your ${where} account has no credit available. A new account starts at zero even with a card on file — add credit at ${billing}, then try again.`
    );
    e.status = 402;
    return e;
  }
  if (status === 429) {
    const e = new Error(`${where} is rate limiting us. Wait a few seconds and try again.`);
    e.status = 429;
    return e;
  }
  if (status === 404 || /model.*(not found|does not exist)/i.test(raw)) {
    const e = new Error(
      `${where} doesn't recognise the model this server asked for. Check the ${service === 'openai' ? 'TRANSCRIBE_MODEL' : 'CLAUDE_MODEL'} setting.`
    );
    e.status = 400;
    return e;
  }
  if (status >= 500) {
    const e = new Error(`${where} is having problems on their end. This usually clears in a minute.`);
    e.status = 502;
    return e;
  }
  return err;
}

/* ============================================================
   public endpoints (no lock, no rate limit)
   ============================================================ */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    locked: Boolean(APP_PASSWORD),
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    whisper: Boolean(process.env.OPENAI_API_KEY),
    sounds: Boolean(FREESOUND_KEY),
    models: { claude: CLAUDE_MODEL, transcribe: TRANSCRIBE_MODEL },
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

/* The sound routes are served from cache and cost nothing, so they don't
   spend the AI budget — browsing the soundboard shouldn't throttle a session.
   Matched on originalUrl, not req.path: inside an app.use('/api', ...) mount
   Express rewrites req.path to be relative, so it is not a stable thing to
   pattern-match against. */
const isFreeRoute = (req) => /^\/api\/sounds\//.test(req.originalUrl || req.url || '');

/** Per-IP burst limit — a sliding one-minute window, kept in memory. */
const hits = new Map();
app.use('/api', (req, res, next) => {
  if (isFreeRoute(req)) return next();
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
  if (isFreeRoute(req)) return next();
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

    // Character and place names are the whole problem with transcribing D&D.
    // gpt-transcribe takes them as a first-class `keywords` list, which works
    // far better than burying them in the prompt the way whisper-1 required.
    const names = String(req.body.vocabulary || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);

    const context =
      'A tabletop Dungeons & Dragons session. Several people talking, often over each other. ' +
      'Expect invented character and place names, spell names, and dice terminology ' +
      '("nat twenty", "d8", "saving throw", "initiative").';

    const legacy = /^whisper/.test(TRANSCRIBE_MODEL);
    const params = { file, model: TRANSCRIBE_MODEL, prompt: context };

    if (legacy) {
      // whisper-1 has no keywords parameter — names have to ride in the prompt.
      params.prompt = `${context} Names used at this table: ${names.join(', ')}`.slice(0, 900);
      params.language = req.body.language || 'en';
      params.response_format = 'json';
    } else {
      if (names.length) params.keywords = names;
      params.languages = [req.body.language || 'en'];
    }

    let result;
    try {
      result = await openai().audio.transcriptions.create(params);
    } catch (e) {
      throw humanize(e, 'openai');
    }

    res.json({ text: (result.text || '').trim(), model: TRANSCRIBE_MODEL });
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
    }).catch((e) => { throw humanize(e, 'anthropic'); });
    res.json({ answer: msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('') });
  })
);

/* ---------- 7. the sound library ---------- */

/* Freesound results barely change, so cache hard. This also keeps us well
   inside Freesound's 60/minute allowance no matter how many people are on. */
const soundCache = new Map();
const SOUND_TTL = 12 * 60 * 60 * 1000;

async function findSounds(pad) {
  const hit = soundCache.get(pad.key);
  if (hit && Date.now() - hit.at < SOUND_TTL) return hit.results;

  const url = new URL('https://freesound.org/apiv2/search/text/');
  url.searchParams.set('query', pad.query);
  // Creative Commons 0 only: no attribution obligations, nothing to trip over
  // if this ever gets shared or streamed.
  url.searchParams.set(
    'filter',
    `license:"Creative Commons 0" duration:${DURATION_FILTER[pad.kind]}`
  );
  url.searchParams.set('sort', 'rating_desc');
  url.searchParams.set('page_size', '8');
  url.searchParams.set('fields', 'id,name,previews,duration,username,url,avg_rating');
  url.searchParams.set('token', FREESOUND_KEY);

  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      const e = new Error('The Freesound key is not being accepted. Check it in your server settings.');
      e.status = 401;
      throw e;
    }
    const e = new Error(`Freesound returned ${res.status}.`);
    e.status = 502;
    throw e;
  }

  const body = await res.json();
  const results = (body.results || [])
    .map((s) => ({
      id: s.id,
      name: s.name,
      url: s.previews?.['preview-hq-mp3'] || s.previews?.['preview-lq-mp3'],
      duration: Math.round(s.duration || 0),
      author: s.username,
      page: s.url,
      rating: Math.round((s.avg_rating || 0) * 10) / 10,
    }))
    .filter((s) => s.url);

  soundCache.set(pad.key, { at: Date.now(), results });
  return results;
}

/** The catalog is static — no network, no key needed. */
app.get('/api/sounds/catalog', (req, res) => {
  res.json({
    live: Boolean(FREESOUND_KEY),
    pads: ALL_PADS.map(({ query, ...rest }) => rest), // the search terms are ours, not the client's business
  });
});

/** Candidates for one pad, so the DM can swap a sound they don't like. */
app.get(
  '/api/sounds/pad/:key',
  asyncRoute(async (req, res) => {
    const pad = PAD_BY_KEY[req.params.key];
    if (!pad) return res.status(404).json({ error: `No sound pad called "${req.params.key}".` });
    if (!FREESOUND_KEY) return res.json({ live: false, results: [] });
    res.json({ live: true, results: await findSounds(pad) });
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
  console.log(`     ${tick(process.env.OPENAI_API_KEY)} Speech   (${TRANSCRIBE_MODEL})`);
  console.log(`     ${tick(FREESOUND_KEY)} Sounds   (${FREESOUND_KEY ? 'real recordings via Freesound' : 'synthesized fallback'})`);
  console.log(`     ${tick(built)} Frontend ${built ? 'served from /dist' : 'not built — run npm run build'}`);
  console.log(`     ${APP_PASSWORD ? '🔒 password required' : '🔓 open to anyone with the link'}`);
  console.log(`     limits: ${RATE_PER_MIN}/min per visitor, ${DAILY_LIMIT}/day total\n`);
});
