// mdrop ローカルサーバーへのクライアント（@require 用の通常スクリプト）。
// globalThis.MdropClient = { trySend, setToken }
// trySend: 成功→Report / 未起動(/health失敗)・トークン入力キャンセル・GM_xmlhttpRequest無し・接続失敗・5xx→null（呼び出し側がフォールバック）
//          401・その他4xx・/clipのタイムアウト→Error（タイムアウトは重複ノート防止のためフォールバックしない）
(function () {
  'use strict';
  const ENDPOINT = 'http://127.0.0.1:18081/clip';
  const HEALTH_ENDPOINT = 'http://127.0.0.1:18081/health';
  const HEALTH_TIMEOUT_MS = 1500;
  const TIMEOUT_MESSAGE = 'mdropの応答がタイムアウトしました。ノートは保存されている可能性があります。Vaultを確認してください。';
  const TOKEN_KEY = 'mdrop.token';
  const PROMPT_TEXT = 'mdropのトークンを入力してください（mdrop config で表示されます）';

  const askToken = () => {
    const input = prompt(PROMPT_TEXT);
    const token = (input ?? '').trim();
    if (!token) return '';
    GM_setValue(TOKEN_KEY, token);
    return token;
  };

  const getToken = () => {
    const saved = String(GM_getValue(TOKEN_KEY, '') ?? '').trim();
    return saved || askToken();
  };

  const parseJson = (res) => {
    if (res.response && typeof res.response === 'object') return res.response;
    try { return JSON.parse(res.responseText); } catch { return null; }
  };

  const isHealthy = () => new Promise((resolve) => {
    const down = () => resolve(false);
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: HEALTH_ENDPOINT,
        timeout: HEALTH_TIMEOUT_MS,
        onload: (res) => resolve(res?.status === 200),
        onerror: down,
        ontimeout: down,
        onabort: down,
      });
    } catch { down(); }
  });

  // 戻り値: レスポンス / null=接続失敗 / { timedOut: true }=タイムアウト
  const post = (token, payload) => new Promise((resolve) => {
    const unreachable = () => resolve(null);
    try {
      GM_xmlhttpRequest({
        method: 'POST',
        url: ENDPOINT,
        headers: { 'Content-Type': 'application/json', 'X-Mdrop-Token': token },
        data: JSON.stringify(payload),
        responseType: 'json',
        timeout: 60000,
        onload: resolve,
        onerror: unreachable,
        ontimeout: () => resolve({ timedOut: true }),
        onabort: unreachable,
      });
    } catch { unreachable(); }
  });

  async function trySend({ path, name, content, source }) {
    if (typeof GM_xmlhttpRequest !== 'function') return null;
    if (!(await isHealthy())) return null; // 未起動: トークンを聞かずにフォールバック
    const token = getToken();
    if (!token) return null;
    const res = await post(token, { path, name, content, source });
    if (res?.timedOut) throw new Error(TIMEOUT_MESSAGE); // 後で書き込まれる可能性があるのでフォールバックしない
    if (!res || !res.status) return null; // 接続失敗
    const body = parseJson(res);
    if (res.status === 401) {
      GM_setValue(TOKEN_KEY, '');
      throw new Error('mdropのトークンが違います。保存したトークンを消去したので、もう一度実行して入力し直してください。');
    }
    if (res.status >= 500) {
      console.warn(`[mdrop] サーバーエラー (${res.status}): ${body?.error ?? res.statusText ?? '不明なエラー'}`);
      return null; // 呼び出し側がフォールバック
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`mdropがエラーを返しました (${res.status}): ${body?.error ?? res.statusText ?? '不明なエラー'}`);
    }
    const report = body ?? {};
    const failed = Array.isArray(report.failed) ? report.failed : [];
    console.log(`[mdrop] ${report.file ?? name}: 画像 ${report.images_saved ?? 0}/${report.images_found ?? 0} 保存, ` +
      `${report.images_reused ?? 0} 再利用, ${failed.length} 失敗 (${report.elapsed_ms ?? '?'}ms)`);
    if (failed.length) console.warn('[mdrop] 画像の取得に失敗:', failed.map(f => f.url));
    return report;
  }

  function setToken() {
    if (typeof GM_setValue !== 'function') return '';
    return askToken();
  }

  globalThis.MdropClient = { trySend, setToken };
})();
