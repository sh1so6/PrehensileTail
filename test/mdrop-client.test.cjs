// node mdrop-client.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ token = 'tok', promptResult = null, noXhr = false, respond, health } = {}) {
  const store = { 'mdrop.token': token };
  const requests = [], logs = [], warns = [], prompts = [];
  const sandbox = {
    GM_getValue: (k, d) => store[k] ?? d,
    GM_setValue: (k, v) => { store[k] = v; },
    prompt: (msg) => { prompts.push(msg); return promptResult; },
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => warns.push(a) },
  };
  const healthy = o => o.onload({ status: 200, responseText: 'ok' });
  if (!noXhr) sandbox.GM_xmlhttpRequest = (opts) => {
    requests.push(opts);
    if (opts.url.endsWith('/health')) (health ?? healthy)(opts); else respond(opts);
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../lib/mdrop-client.js', 'utf8'), context);
  return { client: context.MdropClient, store, requests, logs, warns, prompts };
}

const payload = { path: 'Clippings/x.com', name: 'テスト', content: '---\n---\n本文', source: 'https://x.com/a' };

(async () => {
  // 成功: health → clip の2リクエスト。Report を返し、ヘッダ/本文が正しい
  {
    const report = { file: 'Clippings/x.com/テスト.md', images_found: 2, images_saved: 1, images_reused: 0,
      failed: [{ url: 'https://img/bad.png', error: '404' }], skipped: [], changed: true, elapsed_ms: 12 };
    const t = setup({ respond: o => o.onload({ status: 200, response: report, responseText: JSON.stringify(report) }) });
    const got = await t.client.trySend(payload);
    assert.deepEqual(JSON.parse(JSON.stringify(got)), report);
    assert.equal(t.requests.length, 2);
    const h = t.requests[0];
    assert.equal(h.method, 'GET');
    assert.equal(h.url, 'http://127.0.0.1:18081/health');
    assert.equal(h.timeout, 1500);
    assert.equal(h.headers, undefined);
    const r = t.requests[1];
    assert.equal(r.method, 'POST');
    assert.equal(r.url, 'http://127.0.0.1:18081/clip');
    assert.equal(r.headers['X-Mdrop-Token'], 'tok');
    assert.equal(r.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(r.data), payload);
    assert.equal(r.timeout, 60000);
    assert.equal(t.logs.length, 1);
    assert.equal(t.warns.length, 1);
    assert.ok(t.warns[0].join(' ').includes('bad.png'));
    assert.equal(t.prompts.length, 0);
  }
  // responseText だけでも解釈できる
  {
    const t = setup({ respond: o => o.onload({ status: 200, responseText: '{"file":"a.md","failed":[]}' }) });
    assert.equal((await t.client.trySend(payload)).file, 'a.md');
    assert.equal(t.warns.length, 0);
  }
  // health 不通: null、prompt は呼ばれず /clip も送らない（トークン無しでも）
  for (const token of ['tok', '']) {
    for (const kind of ['onerror', 'ontimeout', 'onabort', 'status500', 'status0']) {
      const health = o => kind.startsWith('status') ? o.onload({ status: Number(kind.slice(6)) }) : o[kind]({});
      const t = setup({ token, promptResult: 'x', health, respond: () => assert.fail('must not post') });
      assert.equal(await t.client.trySend(payload), null, kind);
      assert.equal(t.prompts.length, 0, kind);
      assert.equal(t.requests.length, 1, kind);
    }
  }
  // /clip の接続失敗 (onerror / onabort / status 0) → null
  for (const kind of ['onerror', 'onabort', 'status0']) {
    const t = setup({ respond: o => kind === 'status0' ? o.onload({ status: 0 }) : o[kind]({}) });
    assert.equal(await t.client.trySend(payload), null, kind);
  }
  // /clip タイムアウト: フォールバックせず例外
  {
    const t = setup({ respond: o => o.ontimeout({}) });
    await assert.rejects(t.client.trySend(payload), /タイムアウト.*保存されている可能性/);
    assert.equal(t.store['mdrop.token'], 'tok');
  }
  // 401: トークン消去 + 例外
  {
    const t = setup({ respond: o => o.onload({ status: 401, responseText: '' }) });
    await assert.rejects(t.client.trySend(payload), /トークンが違います/);
    assert.equal(t.store['mdrop.token'], '');
  }
  // 5xx: warn して null（フォールバック）
  {
    const t = setup({ respond: o => o.onload({ status: 500, responseText: '{"error":"disk full"}' }) });
    assert.equal(await t.client.trySend(payload), null);
    assert.equal(t.warns.length, 1);
    assert.ok(t.warns[0].join(' ').includes('disk full'));
    assert.equal(t.store['mdrop.token'], 'tok');
  }
  // 401 以外の 4xx: サーバーの error を含む例外
  {
    const t = setup({ respond: o => o.onload({ status: 400, responseText: '{"error":"bad path"}' }) });
    await assert.rejects(t.client.trySend(payload), e => e.message.includes('bad path') && e.message.includes('400'));
    assert.equal(t.store['mdrop.token'], 'tok');
  }
  // health OK + トークン無し + prompt キャンセル → null（/clip は送らない）
  {
    const t = setup({ token: '', promptResult: null, respond: () => assert.fail('must not send') });
    assert.equal(await t.client.trySend(payload), null);
    assert.equal(t.prompts.length, 1);
    assert.equal(t.requests.length, 1);
  }
  // health OK + トークン無し + prompt 入力 → 保存して送信
  {
    const t = setup({ token: '', promptResult: ' newtok ', respond: o => o.onload({ status: 200, responseText: '{"failed":[]}' }) });
    assert.ok(await t.client.trySend(payload));
    assert.equal(t.store['mdrop.token'], 'newtok');
    assert.equal(t.requests[1].headers['X-Mdrop-Token'], 'newtok');
  }
  // setToken は再入力
  {
    const t = setup({ promptResult: 'again', respond: () => {} });
    t.client.setToken();
    assert.equal(t.store['mdrop.token'], 'again');
  }
  // GM_xmlhttpRequest が無い → null
  {
    const t = setup({ noXhr: true });
    assert.equal(await t.client.trySend(payload), null);
    assert.equal(t.prompts.length, 0);
  }
  console.log('PASS: mdrop-client');
})().catch(error => { console.error(error); process.exitCode = 1; });
