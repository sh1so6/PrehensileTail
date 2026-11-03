// ルートの *.user.js のヘッダーを検査する。
// - 自前の @require / @updateURL / @downloadURL がリポジトリ内の追跡済みファイルを指すこと
// - 自前の @require の ?v= が @version と一致すること（上げ忘れ防止。Tampermonkey の @require キャッシュ対策）
// - miniserve 時代の 127.0.0.1:18080 が残っていないこと
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const RAW = 'https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/';
const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean));

const scripts = fs.readdirSync(ROOT).filter((f) => f.endsWith('.user.js'));
assert.ok(scripts.length > 0, 'no userscripts found');

for (const file of scripts) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  const end = lines.indexOf('// ==/UserScript==');
  const header = lines.slice(0, end).filter((l) => l.startsWith('// @'));
  const meta = (key) => header.filter((l) => l.split(/ +/)[1] === `@${key}`).map((l) => l.split(/ +/)[2]);

  const [version] = meta('version');
  assert.ok(version, `${file}: @version missing`);
  assert.ok(!header.join('\n').includes('127.0.0.1:18080'), `${file}: leftover miniserve URL`);

  for (const key of ['require', 'updateURL', 'downloadURL']) {
    for (const url of meta(key).filter((u) => u.startsWith(RAW))) {
      const [p, query] = url.slice(RAW.length).split('?');
      assert.ok(tracked.has(p), `${file}: @${key} points to untracked file ${p}`);
      if (key === 'require') assert.equal(query, `v=${version}`, `${file}: ${p} needs ?v=${version}`);
      else assert.equal(query, undefined, `${file}: @${key} must not have a query`);
    }
  }
  console.log(`ok ${file} (@version ${version})`);
}
console.log('PASS: userscript headers');
