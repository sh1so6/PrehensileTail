(function () {
  "use strict";

  // ボタン表示の状態 ('idle' | 'busy' | 'done' | 'error')。createButton が差し替える
  let setStatus = () => {};
  let busy = false;

  const runClipper = async () => {
    if (busy) return;
    busy = true;
    setStatus('busy');
    try {
      const saved = await clip();
      setStatus(saved ? 'done' : 'idle', saved);
    } catch (e) {
      console.error("WebClipper Exception:", e);
      setStatus('error', e.message);
      alert(`クリップ処理中にエラーが発生しました。
${e.message}`);
    } finally {
      busy = false;
      console.log('Clipper End');
    }
  };

  // 保存できたら Report、ハンドラ無し・中断なら null、失敗は throw
  const clip = async () => {
    const host = window.location.host;
    const handler = window.ClipperHandlers?.[host] || window.ClipperHandlers?.["default"];

    const baseSetting = {
      name: Array.from(document.title ?? "Untitled").slice(0, 30).join(''),
      path: `Clippings/${_.toDomain(document.URL)}`
    };

    // frontmatterの標準スキーマ定義
    const baseSchema = {
      title: document.title ?? "",
      source: window.location.href ?? "",
      author: "" ?? "",
      published: "" ?? "",
      created: new Date().toISOString().split("T")[0] ?? "",
      description: "" ?? "",
      tags: ["clippings"] ?? [],
    };

    if (!handler) return null;
    const result = await handler(document);
    // ハンドラが何らかの理由で空を返した場合は処理を中断
    if (!result) {
      console.log("Clipper: ハンドラがデータを返さなかったため中断しました。");
      return null;
    }

    const { siteSetting, siteSchema, siteMarkdown } = result;

    // 1. 統合
    const finalSchema = { ...baseSchema, ...siteSchema };
    const finalSetting = { ...baseSetting, ...siteSetting };
    // 2. スキーマからyaml生成
    const yaml = jsyaml.dump(finalSchema, {
      lineWidth: -1, // 折り返しを無効化
      noRefs: true, // 参照を無効化
      quotingType: '"',
    });

    // 3. Headerと合成
    const finalContent = `---
${yaml}
---
${siteMarkdown}`;

    // 4. mdropサーバーへ送る（画像もローカル保存される）
    const mdrop = window.MdropClient ?? globalThis.MdropClient;
    if (!mdrop) throw new Error('mdropクライアントが読み込まれていません。');
    const report = await mdrop.trySend({
      path: finalSetting.path.toWellFormed(),
      name: sanitizeFileName(finalSetting.name),
      content: finalContent.toWellFormed(),
      source: window.location.href,
    });
    if (!report) throw new Error('mdropに接続できませんでした。mdropを起動してからもう一度実行してください。');
    console.log('Clipper Exported!');
    return report;
  };

  // documentに対してリスナーを設定（capture: trueでサイト側の阻止を回避）
  document.addEventListener('keydown', (e) => {
    // Ctrl + Shift + X (コード上はKeyX)
    if (e.altKey && e.shiftKey && e.code === 'KeyX') {
      e.preventDefault();
      e.stopImmediatePropagation(); // 他のスクリプトに邪魔させない
      runClipper();
    }
  }, { capture: true });

  const createButton = () => {
    const host_id = 'webclipper-shadow-host';
    
    // すでにホスト要素（壁）が存在していれば何もしない
    if (document.getElementById(host_id)) {
      return; 
    }

    // 1. Shadow DOMの「土台」となるホスト要素を作成してbodyに追加
    const host = document.createElement('div');
    host.id = host_id;
    // ホスト要素自体が元のサイトのレイアウトを崩さないように無害化
    host.style.cssText = 'position: static; width: 0; height: 0; overflow: visible;';
    document.body.appendChild(host);

    // 2. ホスト要素にShadow DOMを展開（mode: 'closed' で元のサイトから隠蔽）
    const shadowRoot = host.attachShadow({ mode: 'closed' });

    // 3. 実際のボタンを作成（ここはShadow DOMの内部に入ります）
    const btn = document.createElement('button');
    // Shadow DOM内なので、一般的なID名をつけても他のサイトのIDと絶対衝突しません
    btn.id = 'webclipper-button';
    
    // 状態ごとの見た目。done/errorは離れても目立つまま残し、保存済みだと分かるようにする
    const palette = {
      idle:  { bg: '#edededbe', label: '', opacity: { enter: '1', leave: '0.25' }, width: { enter: '30px', leave: '10px' } },
      busy:  { bg: '#ffc107e6', label: '…', opacity: { enter: '1', leave: '0.9' }, width: { enter: '30px', leave: '30px' } },
      done:  { bg: '#2e7d32f2', label: '✓', opacity: { enter: '1', leave: '0.9' }, width: { enter: '30px', leave: '30px' } },
      error: { bg: '#c62828f2', label: '!', opacity: { enter: '1', leave: '0.9' }, width: { enter: '30px', leave: '30px' } },
    };
    const titles = {
      idle: 'クリップして保存 (Alt+Shift+X)',
      busy: '保存中…',
      done: '保存済み（クリックで再保存）',
      error: '保存に失敗しました（クリックで再試行）',
    };
    let status = 'idle', hovered = false, resetTimer = null;

    btn.innerText = '';
    // Shadow DOM内なので、元のサイトのCSSに邪魔されず、意図した通りのスタイルが適用されます
    btn.style.cssText = `
      all: initial;
      box-sizing: content-box; /* サイト側の border-box に負けないための設定 */
      margin: 0;
      padding: 0;

      position: fixed;
      top: 20%;
      left: -9px;
      transform: translateY(-50%);
      height: 60px;
      line-height: 60px;
      text-align: center;
      font: bold 18px/60px system-ui, sans-serif;
      color: #fff;

      border: 15px solid transparent;
      background-clip: padding-box;

      outline: 1.5px solid rgba(255, 255, 255, 0.8);
      outline-offset: -15px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);

      border-radius: 20px;
      cursor: pointer;
      z-index: 2147483647;
      transition: all 0.15s;
    `;

    const render = () => {
      const p = palette[status];
      const side = hovered ? 'enter' : 'leave';
      btn.style.backgroundColor = p.bg;
      btn.style.opacity = p.opacity[side];
      btn.style.width = p.width[side];
      btn.style.cursor = status === 'busy' ? 'progress' : 'pointer';
      btn.textContent = p.label;
    };

    setStatus = (next, detail) => {
      clearTimeout(resetTimer);
      status = next;
      let title = titles[next];
      if (next === 'done' && detail?.file) {
        const images = detail.images_found ? ` / 画像 ${detail.images_saved ?? 0}/${detail.images_found}` : '';
        title = `保存済み: ${detail.file}${images}（クリックで再保存）`;
      } else if (next === 'error' && detail) {
        title = `保存に失敗: ${detail}（クリックで再試行）`;
      }
      btn.title = title;
      btn.setAttribute('aria-label', title);
      render();
      // 失敗表示は一定時間で通常に戻す。保存済みは次の操作まで残す
      if (next === 'error') resetTimer = setTimeout(() => setStatus('idle'), 8000);
    };
    setStatus('idle');

    btn.onmouseenter = () => { hovered = true; render(); };
    btn.onmouseleave = () => { hovered = false; render(); };

    btn.onclick = (e) => {
      e.stopPropagation();
      runClipper();
    };

    // 4. 完成したボタンを、bodyではなく「Shadow DOMの中」に追加
    shadowRoot.appendChild(btn);
  };
  
  createButton();

  // テストは最後に登録されたコマンドを実行するので、クリッパー本体を最後に登録する
  const mdropClient = window.MdropClient ?? globalThis.MdropClient;
  if (mdropClient) GM_registerMenuCommand("🔑 mdropトークン設定", () => mdropClient.setToken());
  GM_registerMenuCommand("🚀 クリップして保存", runClipper);
})();

/**
 * ファイル名に使用不可能な文字を排除する
 */
function sanitizeFileName(fileName, replacement = "") {
    const illegalChars = /[\\/:#*?"<>|\x00-\x1F\x7F]/g;
    let sanitized = fileName.toWellFormed().replace(illegalChars, replacement);
    sanitized = sanitized.trim().replace(/^\.+|\.+$/g, "");
    return sanitized || "Untitled";
}
