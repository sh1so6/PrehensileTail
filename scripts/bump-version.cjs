// 使い方: node scripts/bump-version.cjs <x.user.js> <新バージョン>
// @version と、自前の @require（?v=）を同時に書き換える。
// Tampermonkey は @version が変わったときだけ @require を取り直すため、?v= を合わせてキャッシュを無効化する。
const fs = require('node:fs');
const path = require('node:path');

const RAW = 'https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/';
const [file, version] = process.argv.slice(2);
if (!file || !/^[0-9]+[.][0-9]+[.][0-9]+$/.test(version ?? '')) {
  console.error('usage: node scripts/bump-version.cjs <x.user.js> <x.y.z>');
  process.exit(1);
}

const target = path.resolve(file);
const lines = fs.readFileSync(target, 'utf8').split(/(\r?\n)/).map((line) => {
  if (line.startsWith('// @version')) return line.replace(/[^ ]+$/, version);
  if (line.startsWith('// @require') && line.includes(RAW)) return line.replace(/[?]v=[^ ]+$/, `?v=${version}`);
  return line;
});
fs.writeFileSync(target, lines.join(''));
console.log(`${path.basename(target)} -> ${version}`);
