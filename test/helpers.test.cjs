// _.js の純粋関数（toDomain / doCleansing）のテスト。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {}, console, URL };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/../core/helpers.js', 'utf8'), context);
const _ = context.window._;

assert.equal(_.toDomain('https://www.example.com/a?b=1'), 'example.com');
assert.equal(_.toDomain('not a url'), 'not a url');

// 行末の「バックスラッシュ+改行」は改行だけに、数値文字参照は元の文字に戻る。
// 「バックスラッシュ+n」の2文字は触らない
const BS = String.fromCharCode(92);
assert.equal(_.doCleansing('a' + BS + String.fromCharCode(10) + 'b'), 'a' + String.fromCharCode(10) + 'b');
assert.equal(_.doCleansing('a' + BS + 'nb'), 'a' + BS + 'nb');
assert.equal(_.doCleansing('&#x41;&#66;'), 'AB');
console.log('PASS: _.js helpers');
