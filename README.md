# ⚔ The Dungeon Master's Table

A one-stop shop for running D&D — live session recording with automatic transcription and
AI-written session notes, character sheets you upload once, an improv forge for everything you
forgot to prep, and a soundboard that needs no audio files.

React on the front, a small Express server on the back, served as **one website from one URL**.
Claude does the writing and reading; Whisper does the listening; the Web Audio API does the music.

---

# Putting it on the web

This is the recommended way, and it needs **no Terminal and no commands** — just a browser, some
clicking, and about fifteen minutes. When you're done you'll have a real URL you can open from any
computer.

You'll make two free accounts along the way: **GitHub** (where the code lives) and **Render**
(which turns the code into a live site).

## Step 1 — Get the folder ready

Unzip the download. You should have a folder called `dm-toolkit` containing `package.json`,
`README.md`, a `src` folder, and a `server` folder. That whole folder is what you're uploading.

## Step 2 — Put the code on GitHub

1. Make an account at [github.com](https://github.com) if you don't have one.
2. Click the **+** in the top-right corner → **New repository**.
3. Name it `dungeon-masters-table`. Choose **Private** if you'd rather nobody browsed the code.
   Don't tick any of the "initialize with" boxes. Click **Create repository**.
4. On the next screen click **uploading an existing file**.
5. Open your `dm-toolkit` folder, select everything inside it, and drag it onto the page.
   *Drag the contents, not the folder itself* — GitHub should end up showing `package.json` and
   `src` at the top level, not `dm-toolkit/package.json`.
6. Scroll down, click **Commit changes**.

## Step 3 — Deploy it on Render

1. Make an account at [render.com](https://render.com) and choose **Sign up with GitHub**, which
   saves you connecting them later.
2. In the Render dashboard click **New +** → **Blueprint**.
3. Pick your `dungeon-masters-table` repository and click **Connect**.
4. Render finds the `render.yaml` file in your repo and fills in every setting itself. It will
   stop and ask you for three values:

   | It asks for | You paste |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | your Claude key (Step 4 below) |
   | `OPENAI_API_KEY` | your OpenAI key (Step 4 below) |
   | `APP_PASSWORD` | leave this **empty** — see *Locking it down* if you change your mind |

5. Click **Apply**. Render builds the site, which takes three to five minutes. Watch the log
   scroll; when it says **Live**, you're done.
6. Your URL is at the top of the page and looks like
   `https://dungeon-masters-table.onrender.com`. Bookmark it. That's the website.

<details>
<summary><b>If Render doesn't offer a Blueprint option</b></summary>

Use **New +** → **Web Service** instead, connect the repo, and type these in by hand:

- **Runtime:** Node
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Instance Type:** Free

Then add the environment variables under the **Environment** section: `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, and `NODE_VERSION` set to `20`.

</details>

## Step 4 — The two API keys

The site needs to talk to two AI services, and each wants a key — a long string of characters that
says "bill this usage to me."

**Optional third key — real audio.** [freesound.org](https://freesound.org) is free with no credit
card. Sign up, then apply for an API key at
[freesound.org/apiv2/apply](https://freesound.org/apiv2/apply) (approval is instant). Add it in
Render → **Environment** → **Add Environment Variable** → `FREESOUND_API_KEY`. The soundboard
switches from synthesized tones to real recordings the moment it redeploys. Skip it and everything
still works, just synthesized.

**Claude** (writes your session notes, runs the generators, reads character sheets):
go to [console.anthropic.com](https://console.anthropic.com/settings/keys), sign up, add a payment
method, then **Create Key**. Copy it immediately; it's only shown once.

**OpenAI Whisper** (turns your recorded session into text):
go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys), sign up, add a payment
method, then **Create new secret key**. Same deal — copy it right away.

Both are pay-as-you-go with no subscription. Expect **well under a dollar per four-hour session**.

If you already deployed and want to add or change a key later: Render dashboard → your service →
**Environment** → edit → **Save**, and it redeploys itself in about a minute.

---

# Things to know about your live site

**It falls asleep.** The free plan puts the site to sleep after about fifteen minutes with no
visitors. The next person to open it waits 30–60 seconds while it wakes up. In practice: open the
tab a few minutes before your session starts and leave it open. If that ever gets annoying, Render
dashboard → your service → **Settings** → change the instance type to Starter (about $7/month) and
it never sleeps.

**Anyone with the link can use it, and that spends your money.** You chose an open site, which is
fine — nobody finds a random Render URL by accident. But the app ships with two guardrails so a
bad day can't become a big bill:

- Any single visitor is capped at **25 requests per minute**
- The whole site is capped at **1,500 AI requests per day**, resetting at midnight UTC

Change either in Render → **Environment** (`RATE_LIMIT_PER_MIN`, `DAILY_REQUEST_LIMIT`). It's also
worth setting a hard spending limit in the Anthropic and OpenAI billing dashboards — belt and
braces, and it takes a minute.

**Locking it down later.** If you decide you want a password after all, you don't need to change
any code: Render → **Environment** → set `APP_PASSWORD` to any word → **Save**. A lock screen
appears in front of the app on the next load. Clear the value to open it back up.

**Your microphone will work.** Browsers only allow recording on secure connections, and Render
gives every site HTTPS automatically. This is one thing that's genuinely better hosted than local.

**Where your data lives.** Your campaign, characters, sessions, transcripts, and saved generations
are stored **in the browser you're using**, not on the server. That means it survives refreshes and
redeploys, it does *not* follow you to another computer or your phone, and clearing your browser
data wipes it. Use **⚙ Campaign → Export everything** for backups — it's one JSON file you can
import anywhere.

**Updating it later.** Two minutes, no Terminal:

1. Open your repository on GitHub
2. Click **Add file** → **Upload files**
3. Drag in the new or changed files — GitHub replaces anything with a matching name and leaves the
   rest alone. When in doubt, drag the whole folder contents again; that's always safe.
4. Scroll down, **Commit changes**

Render notices within seconds and rebuilds itself. Watch the deploy log if you like; you don't need
to touch any settings.

---

# The tabs

### 🔴 Live Session
The screen you actually run the game from.

- **Recording & transcription.** The microphone starts the moment you open a session — no second
  button to forget. The recorder runs a relay: it records a complete, self-contained audio file
  every N seconds (20 by default, adjustable from 10), ships it off for transcription, and
  immediately starts the next one, so text arrives more or less continuously. Your character names and campaign glossary ride along in the
  transcription model's `keywords` parameter, which exists precisely so that "Kaelthorne" doesn't
  come back as "kale thorn."
- **Hit points that keep themselves.** As the transcript comes in, Claude watches it for damage,
  healing, temp HP, going down, and rests. Anything it finds appears as a suggestion card with a
  confidence rating — you press ✓ or ✕. Turn on *"apply high-confidence changes without asking"* in
  Campaign settings and the obvious ones ("Kael takes 13 slashing") just happen. Every card is
  manual-first: −1, −5, a number box, heal, full heal, temp HP, conditions, and death saves.
- **Initiative tracker** with one-click party adding and blank-roll filling.
- **Ask the Sage** — a fast 5e ruling without leaving the table.
- **Session log** of everything that happened, exportable.

Ending the session archives the transcript, downloads the full audio as a backup, and hands the
whole thing to Claude to write up.

### 📜 Session Notes
The chronicle. Each session becomes a recap you can read aloud at the top of next week, plus a
timeline, NPCs met with dispositions, locations, loot, combats, decisions with consequences, open
threads rated hot/warm/cold, memorable quotes, the exact cliffhanger, a prioritized prep list, and
an honest list of what the transcript was too muddy to catch.

You can also **import** — drop in an audio file from a session you already recorded (files over
24 MB are sliced automatically for Whisper), or paste a transcript from Discord, Craig, a voice
memo, or your own notes.

Proper nouns from each write-up feed back into the campaign glossary, so transcription accuracy
improves session over session.

### 🛡️ The Party
Drag character sheets in — official PDFs, D&D Beyond exports, a photo of a handwritten sheet, or
just a paragraph describing the character. Claude extracts the whole thing into a real interface:
abilities with modifiers, skills with proficiency and expertise marks, attacks, spell slots and
spell lists by level, features, gear, currency, personality, backstory. Anything it couldn't read
is flagged rather than invented.

Hit points here are the same hit points as in the live session — change them in one place, they
change in both.

### 🎲 Improv Forge
Twelve generators, each shaped by your campaign's tone, level, and setting:

**NPC** (with a mechanically legal stat block) · **Town or City** · **Side Quest** · **Combat
Encounter** · **Shop & Inventory** · **Tavern** · **Magic Item** · **Dungeon/Lair** · **Trap or
Hazard** · **Rumor Table** · **Plot Twists** · **Name Bank**

Results render as proper stat blocks and boxed read-aloud text. Save anything worth keeping to the
Vault, search it later, copy it or export it as Markdown.

### 🎵 Soundboard
Twenty-four ambiences and forty-nine effects. Every pad resolves through three sources, in order:

1. **A file you uploaded** — click the `⋯` on any pad and drop in your own MP3. Stored in your
   browser, overrides everything else. This is the escape hatch when you know exactly what you want.
2. **A real recording** — if a Freesound key is configured, the server searches for the pad's sound,
   filtered to Creative Commons Zero (public domain: no attribution, nothing to trip over). The `⋯`
   menu shows the top candidates with previews so you can swap any take you don't like. Your choice
   is remembered.
3. **Synthesis** — the built-in Web Audio patches, used automatically whenever the first two aren't
   available. Never fails, never loads, always makes *something*.

Picking a new ambience crossfades over about a second. Sound keeps playing while you work in other
tabs. Keys `1`–`9` fire the first nine effects; `Esc` kills the ambience.

---

# Keyboard

| Key | Does |
| --- | --- |
| `Alt` + `1`–`5` | Jump between tabs |
| `1`–`9` | Fire a sound effect (on the Soundboard tab) |
| `Esc` | Stop the ambience / close a dialog |
| `Enter` in an HP box | Apply as damage |
| `Shift`+`Enter` in an HP box | Apply as healing |

---

# Running it on your own computer instead

Only needed if you want to change the code. Requires Node 18 or newer.

```bash
npm install
cp server/.env.example server/.env      # then paste your keys into that file
npm run dev                             # → http://localhost:5173
```

`npm run dev` runs the two halves separately — Vite on `:5173` with hot reload, the API on `:8787`,
with `/api` proxied across.

To see exactly what the deployed site will do, build it and serve it as one process:

```bash
npm run preview                         # → http://localhost:8787
```

`npm run verify` runs the static checks: every generator schema, the JSON extractor, the
import graph, and package completeness.

---

# Layout

```
├── render.yaml             tells Render how to build and run everything
├── index.html
├── vite.config.js          in development, proxies /api → :8787
├── server/
│   ├── index.js            API + serves the built app + rate limits + optional password
│   ├── prompts.js          every prompt and output schema lives here
│   ├── soundpacks.js       the pad catalog and what each one searches for
│   └── .env.example        local development only; on Render these are dashboard settings
└── src/
    ├── App.jsx             shell, tabs, campaign settings, lock screen
    ├── styles/theme.css    the whole design system
    ├── lib/
    │   ├── store.js        tiny global store, persisted to the browser
    │   ├── api.js          backend client
    │   ├── recorder.js     chunked MediaRecorder relay
    │   └── audio.js        the entire soundboard, synthesized
    ├── components/
    │   ├── ui.jsx          panels, toasts, modals, HP bars, stat blocks
    │   └── Crest.jsx
    └── tabs/
        ├── LiveSession.jsx
        ├── SessionNotes.jsx
        ├── Characters.jsx
        ├── Improv.jsx
        └── Soundboard.jsx
```

Want a different generator? Add an entry to `GENERATORS` in `server/prompts.js` with a schema and a
prompt builder, then add it to `KINDS` and `FIELDS` in `src/tabs/Improv.jsx`. The renderer is
generic — it will lay out whatever shape you describe.

Want a different ambience or effect? Add an entry to `AMBIENCE_PACK` or `SFX_PACK` in
`server/soundpacks.js` — a label, a glyph, a Freesound search query, and the name of a synthesized
patch to fall back on. It appears on the board immediately. To write a new synthesized patch, add it
to `AMBIENCES` or `SFX` in `src/lib/audio.js`, where you get `drone`, `noiseLayer`, `pluck`, `tone`,
`drum`, and `burst` as primitives plus an `every(ms, fn)` scheduler.

> One deliberate oddity: `vite` and `@vitejs/plugin-react` sit in `dependencies` rather than
> `devDependencies`. Hosting platforms commonly set `NODE_ENV=production`, which makes npm skip
> `devDependencies` — and then the build has no build tool. This way it deploys anywhere without
> special flags.

---

# Notes and limits

- Chrome, Edge, and Firefox all record reliably. Safari's `MediaRecorder` support is newer and less
  predictable — test before you rely on it for a session.
- Transcription defaults to OpenAI's `gpt-transcribe`, which is considerably better than the older
  `whisper-1` on several people talking over each other. Set `TRANSCRIBE_MODEL` if you want the old
  one back. Either way the campaign glossary helps a lot. The write-up is instructed to flag what it couldn't make out rather than invent it.
- HP detection is deliberately conservative: it only reports a change when both the target and the
  number are clear, and it never touches monster HP.
- The rate limits live in the server's memory, so they reset whenever the site sleeps or
  redeploys. They're a guardrail against runaway usage, not a security system. A password is the
  security system.
