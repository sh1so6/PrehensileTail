// node entrypoint.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ custom = false, handler, mdrop = 'ok' } = {}) {
  let run, button;
  const errors = [], sent = [], timers = [];
  const location = { host: 'example.com', href: 'https://example.com/' };
  const makeEl = () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, appendChild() {}, attachShadow() { return { appendChild: el => { button = el; } }; } });
  const MdropClient = mdrop === 'none' ? undefined : {
    trySend: async args => {
      sent.push(args);
      if (mdrop === 'down') return null;
      if (mdrop === 'throw') throw new Error('token');
      return { file: 'x.md', images_found: 2, images_saved: 1 };
    },
  };
  const context = vm.createContext({
    window: { location, MdropClient, ClipperHandlers: { default: handler ?? (async () => ({
      siteSetting: custom ? { name: '名前\uD800', path: 'Clippings/不正\uDC00' } : {},
      siteSchema: {}, siteMarkdown: '本文😀\uD800',
    })) } },
    document: {
      title: 'a'.repeat(29) + '😀続き', URL: location.href, body: makeEl(),
      getElementById: () => null, createElement: makeEl, addEventListener() {},
    },
    setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimeout: t => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    _: { toDomain: () => 'example.com' },
    jsyaml: { dump: () => '' },
    GM_registerMenuCommand: (_, fn) => { run = fn; },
    console, alert: message => errors.push(message),
  });
  vm.runInContext(fs.readFileSync('entrypoint.js', 'utf8'), context);
  return { run: () => run(), button, errors, sent, timers };
}

(async () => {
  // 成功: mdropへ送り、ボタンが✓になる（Obsidian URIは使わない）
  for (const custom of [false, true]) {
    const t = setup({ custom });
    assert.equal(t.button.textContent, '');
    const p = t.run();
    assert.equal(t.button.textContent, '…', 'busy while sending');
    await p;
    assert.deepEqual(t.errors, []);
    assert.equal(t.sent.length, 1);
    assert.equal(t.sent[0].path, custom ? 'Clippings/不正\uFFFD' : 'Clippings/example.com');
    assert.equal(t.sent[0].name, custom ? '名前\uFFFD' : 'a'.repeat(29) + '😀');
    assert.ok(t.sent[0].content.endsWith('本文😀\uFFFD'));
    assert.equal(t.button.textContent, '✓');
    assert.ok(t.button.title.includes('保存済み: x.md'));
    assert.equal(t.button.attrs['aria-label'], t.button.title);
  }
  // 実行中の二重起動は無視
  {
    const t = setup();
    await Promise.all([t.run(), t.run()]);
    assert.equal(t.sent.length, 1);
  }
  // mdrop未起動: エラー表示し、一定時間後に通常へ戻る
  for (const mdrop of ['down', 'none', 'throw']) {
    const t = setup({ mdrop });
    await t.run();
    assert.equal(t.errors.length, 1);
    assert.equal(t.button.textContent, '!');
    const reset = t.timers.find(x => x.ms === 8000);
    assert.ok(reset);
    reset.fn();
    assert.equal(t.button.textContent, '');
  }
  // ハンドラが空を返したら送らず、✓にもしない
  {
    const t = setup({ handler: async () => null });
    await t.run();
    assert.equal(t.sent.length, 0);
    assert.equal(t.button.textContent, '');
    assert.deepEqual(t.errors, []);
  }
  console.log('PASS: mdrop only, button shows busy/done/error');
})().catch(error => { console.error(error); process.exitCode = 1; });
