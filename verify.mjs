/* Static verification harness — checks what we can without a bundler. */
import fs from 'fs';
import path from 'path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
let fails = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { fails++; console.log(`  ✗ ${m}`); };

/* ---------- 1. every generator builds a prompt ---------- */
console.log('\n[1] Generator prompts');
const { GENERATORS, generatorPrompt, SYNTHESIS_SYSTEM, synthesisUser, SHEET_SYSTEM, COMBAT_SYSTEM } =
  await import('./server/prompts.js');

for (const kind of Object.keys(GENERATORS)) {
  try {
    const { system, user } = generatorPrompt(kind, { level: 5, tone: 'grimdark', notes: 'x' });
    if (!system.includes('{') || !user.length) throw new Error('empty prompt');
    // the schema embedded in the system prompt must be parseable JSON structure
    const schema = GENERATORS[kind].schema;
    JSON.parse(schema.replace(/\/\/.*$/gm, ''));
    ok(`${kind} — prompt ${system.length + user.length} chars, schema parses`);
  } catch (e) {
    bad(`${kind} — ${e.message}`);
  }
}
try {
  generatorPrompt('nonsense', {});
  bad('unknown generator should throw');
} catch { ok('unknown generator throws'); }

for (const [name, s] of [['SYNTHESIS_SYSTEM', SYNTHESIS_SYSTEM], ['SHEET_SYSTEM', SHEET_SYSTEM], ['COMBAT_SYSTEM', COMBAT_SYSTEM]]) {
  const m = s.match(/\{[\s\S]*\}$/);
  try { JSON.parse(m[0]); ok(`${name} schema parses`); } catch (e) { bad(`${name} schema: ${e.message}`); }
}
ok(`synthesisUser renders (${synthesisUser({ transcript: 'hi', roster: [{ name: 'A' }], glossary: ['B'] }).length} chars)`);

/* ---------- 2. the JSON extractor on realistic model output ---------- */
console.log('\n[2] JSON extraction from model output');
const src = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
const fnSrc = src.slice(src.indexOf('function extractJson'), src.indexOf('/** One-shot JSON call'));
const extractJson = new Function(`${fnSrc}; return extractJson;`)();

const cases = [
  ['plain', '{"a":1}', { a: 1 }],
  ['fenced', '```json\n{"a":1}\n```', { a: 1 }],
  ['preamble', 'Here you go:\n{"a":1}', { a: 1 }],
  ['prefilled', '{"name":"Kael","hp":22}', { name: 'Kael', hp: 22 }],
  ['brace in string', '{"desc":"a } brace","n":2}', { desc: 'a } brace', n: 2 }],
  ['escaped quote', '{"q":"say \\"hi\\" }","n":3}', { q: 'say "hi" }', n: 3 }],
  ['nested + trailing', '{"a":{"b":[1,2]}}\nHope that helps!', { a: { b: [1, 2] } }],
];
for (const [label, input, expected] of cases) {
  try {
    const got = extractJson(input);
    if (JSON.stringify(got) === JSON.stringify(expected)) ok(label);
    else bad(`${label} — got ${JSON.stringify(got)}`);
  } catch (e) { bad(`${label} — threw ${e.message}`); }
}
try { extractJson('no json here'); bad('garbage should throw'); } catch { ok('garbage throws'); }

/* ---------- 3. audio definitions are well-formed ---------- */
console.log('\n[3] Soundboard definitions');
const audioSrc = fs.readFileSync(path.join(ROOT, 'src/lib/audio.js'), 'utf8');
const ambKeys = [...audioSrc.matchAll(/^\s{4}key: '([a-zA-Z]+)',\s*label:/gm)].map((m) => m[1]);
const dupes = ambKeys.filter((k, i) => ambKeys.indexOf(k) !== i);
dupes.length ? bad(`duplicate sound keys: ${dupes.join(', ')}`) : ok(`${ambKeys.length} unique ambience+sfx keys`);

// note() must produce sane frequencies
const noteFn = new Function(`
  const A4 = 440;
  ${audioSrc.slice(audioSrc.indexOf('export function note'), audioSrc.indexOf('const rand =')).replace('export ', '')}
  return note;`)();
const checks = [['A4', 440], ['C4', 261.63], ['A3', 220], ['C1', 32.70], ['F#1', 46.25], ['Eb4', 311.13]];
for (const [n, hz] of checks) {
  const got = noteFn(n);
  Math.abs(got - hz) < 0.5 ? ok(`note('${n}') = ${got.toFixed(2)} Hz`) : bad(`note('${n}') = ${got} expected ~${hz}`);
}

/* ---------- 4. import/export graph ---------- */
console.log('\n[4] Import graph');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(e.name) && e.name !== 'verify.mjs') files.push(p);
  }
})(path.join(ROOT, 'src'));
files.push(path.join(ROOT, 'server/index.js'), path.join(ROOT, 'server/prompts.js'));

const exportsOf = (file) => {
  const s = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]+)\}/g))
    m[1].split(',').forEach((x) => names.add(x.split(/\s+as\s+/).pop().trim()));
  if (/export\s+default/.test(s)) names.add('default');
  return names;
};

let edges = 0;
for (const file of files) {
  const s = fs.readFileSync(file, 'utf8');
  // [^;]*? keeps each match inside a single import statement
  for (const m of s.matchAll(/import\s+([^;]*?)\s+from\s+'(\.[^']+)'/g)) {
    const target = path.resolve(path.dirname(file), m[2]);
    if (!fs.existsSync(target)) { bad(`${path.relative(ROOT, file)} → missing ${m[2]}`); continue; }
    const avail = exportsOf(target);
    const clause = m[1];
    const named = clause.match(/\{([\s\S]*)\}/);
    const def = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
    if (def && !avail.has('default')) bad(`${path.relative(ROOT, file)}: no default export in ${m[2]}`);
    if (named) {
      for (const raw of named[1].split(',')) {
        const n = raw.split(/\s+as\s+/)[0].trim();
        if (!n) continue;
        edges++;
        if (!avail.has(n)) bad(`${path.relative(ROOT, file)}: "${n}" is not exported by ${m[2]}`);
      }
    }
  }
}
ok(`${edges} named imports across ${files.length} modules all resolve`);

/* ---------- 5. JSX element balance (rough but catches real slips) ---------- */
console.log('\n[5] JSX / brace balance');
for (const file of files.filter((f) => f.endsWith('.jsx'))) {
  const s = fs.readFileSync(file, 'utf8');
  const bal = (a, b) => (s.split(a).length - s.split(b).length);
  const braces = bal('{', '}');
  const parens = bal('(', ')');
  const frags = (s.match(/<>/g) || []).length - (s.match(/<\/>/g) || []).length;
  if (braces || parens || frags)
    bad(`${path.relative(ROOT, file)}: braces ${braces}, parens ${parens}, fragments ${frags}`);
  else ok(`${path.relative(ROOT, file)} balanced`);
}

/* ---------- 6. package.json sanity ---------- */
console.log('\n[6] package.json');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const usedPkgs = new Set();
for (const file of files) {
  const s = fs.readFileSync(file, 'utf8');
  for (const m of s.matchAll(/from\s+'([^.'][^']*)'/g)) {
    const p = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
    usedPkgs.add(p);
  }
}
const declared = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]);
const BUILTINS = new Set(['fs', 'path', 'url', 'crypto', 'os', 'http', 'https', 'stream', 'buffer', 'util', 'events']);
for (const p of usedPkgs) {
  if (p === 'dotenv/config' || BUILTINS.has(p)) continue;
  declared.has(p) ? ok(`${p} declared`) : bad(`${p} imported but not in package.json`);
}
// vite must be a runtime dependency, or hosts that set NODE_ENV=production
// skip it and the build has no build tool.
['vite', '@vitejs/plugin-react'].forEach((p) =>
  pkg.dependencies[p] ? ok(`${p} in dependencies (survives NODE_ENV=production)`)
                      : bad(`${p} must be in dependencies, not devDependencies`)
);
fs.existsSync(path.join(ROOT, 'render.yaml')) ? ok('render.yaml present') : bad('render.yaml missing');
['dev', 'build', 'start'].forEach((s) => (pkg.scripts[s] ? ok(`script "${s}"`) : bad(`missing script "${s}"`)));

console.log(fails ? `\n✗ ${fails} problem(s)\n` : '\n✓ all checks passed\n');
process.exit(fails ? 1 : 0);
