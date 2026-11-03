// 単一ファイル版 userscript を dist/ に生成する（miniserve不要）。
// 使い方: node build-standalone.cjs
// - 127.0.0.1:18080 の @require はローカルファイルを、raw.githubusercontent.com の @require は
//   コミット固定URLを取得して、元の順序のまま本体の直前に埋め込む。
// - CDN の @require はそのまま残す。127.0.0.1:18080 向けの @updateURL/@downloadURL は削除する。
// - lib/bundle.js が無い場合は先に `cd lib && pnpm install && pnpm build` を実行すること。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const LOCAL = 'http://127.0.0.1:18080/';
const TARGETS = ['loader.user.js', 'sourcecapsule-md.user.js', 'xclipper.user.js'];

const stripHeader = (src) => src.replace(/^\s*\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

async function load(url) {
  if (url.startsWith(LOCAL)) {
    const file = path.join(ROOT, url.slice(LOCAL.length));
    if (!fs.existsSync(file)) throw new Error(`見つかりません: ${file}`);
    return fs.readFileSync(file, 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return stripHeader(await res.text());
}

async function build(name) {
  const src = fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/^\uFEFF/, '');
  const m = src.match(/^([\s\S]*?\/\/ ==UserScript==\r?\n)([\s\S]*?)(\/\/ ==\/UserScript==\r?\n?)([\s\S]*)$/);
  if (!m) throw new Error(`ヘッダーが見つかりません: ${name}`);
  const [, , headerBody, , body] = m;

  const inlined = [];
  const lines = [];
  for (const line of headerBody.split(/\r?\n/)) {
    const req = line.match(/^\/\/\s*@require\s+(\S+)/);
    if (req && (req[1].startsWith(LOCAL) || req[1].startsWith('https://raw.githubusercontent.com/'))) {
      inlined.push({ url: req[1], code: await load(req[1]) });
      continue;
    }
    if (/^\/\/\s*@(updateURL|downloadURL)\s+http:\/\/127\.0\.0\.1:18080\//.test(line)) continue;
    lines.push(line);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();

  const parts = [
    '// ==UserScript==', ...lines, '// ==/UserScript==', '',
    '// 生成物: node build-standalone.cjs で作成。直接編集しないこと。',
    ...inlined.flatMap(({ url, code }) => [`// ---- inlined: ${url} ----`, code.replace(/\s+$/, ''), '']),
    body.replace(/^\s+/, ''),
  ];
  const out = path.join(ROOT, 'dist', name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, parts.join('\n'));
  console.log(`${name}: ${inlined.length}個を埋め込み -> dist/${name} (${fs.statSync(out).size} bytes)`);
}

(async () => { for (const t of TARGETS) await build(t); })().catch((e) => { console.error(e); process.exit(1); });
