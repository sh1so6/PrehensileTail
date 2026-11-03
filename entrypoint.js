(function () {
  'use strict';

  const HOST_ID = 'webclipper-shadow-host';
  const ERROR_RESET_MS = 8000;

  // 状態ごとの見た目。done/error は離れても目立つまま残し、保存済みだと分かるようにする
  const PALETTE = {
    idle:  { bg: '#edededbe', label: '',  opacity: { enter: '1', leave: '0.25' }, width: { enter: '30px', leave: '10px' } },
    busy:  { bg: '#ffc107e6', label: '…', opacity: { enter: '1', leave: '0.9' },  width: { enter: '30px', leave: '30px' } },
    done:  { bg: '#2e7d32f2', label: '✓', opacity: { enter: '1', leave: '0.9' },  width: { enter: '30px', leave: '30px' } },
    error: { bg: '#c62828f2', label: '!', opacity: { enter: '1', leave: '0.9' },  width: { enter: '30px', leave: '30px' } },
  };

  const TITLES = {
    idle: 'クリップして保存 (Alt+Shift+X)',
    busy: '保存中…',
    done: '保存済み（クリックで再保存）',
    error: '保存に失敗しました（クリックで再試行）',
  };

  // Shadow DOM 内なので、サイト側の CSS に邪魔されない
  const HOST_CSS = 'position: static; width: 0; height: 0; overflow: visible;';
  const BUTTON_CSS = `
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

  // ボタン表示の状態 ('idle' | 'busy' | 'done' | 'error')。createButton が差し替える
  let setStatus = () => {};
  let busy = false;

  /** ファイル名に使用不可能な文字を排除する */
  const sanitizeFileName = (fileName, replacement = '') => {
    const illegalChars = /[\\/:#*?"<>|\x00-\x1F\x7F]/g;
    const sanitized = fileName
      .toWellFormed()
      .replace(illegalChars, replacement)
      .trim()
      .replace(/^\.+|\.+$/g, '');
    return sanitized || 'Untitled';
  };

  const getMdropClient = () => window.MdropClient ?? globalThis.MdropClient;

  // 保存できたら Report、ハンドラ無し・中断なら null、失敗は throw
  const clip = async () => {
    const handler = window.ClipperHandlers?.[window.location.host] || window.ClipperHandlers?.['default'];
    if (!handler) return null;

    // ハンドラが返す値で上書きされる標準値
    const baseSetting = {
      name: Array.from(document.title).slice(0, 30).join(''),
      path: `Clippings/${_.toDomain(document.URL)}`,
    };
    const baseSchema = {
      title: document.title,
      source: window.location.href,
      author: '',
      published: '',
      created: new Date().toISOString().split('T')[0],
      description: '',
      tags: ['clippings'],
    };

    const result = await handler(document);
    // ハンドラが何らかの理由で空を返した場合は処理を中断
    if (!result) {
      console.log('Clipper: ハンドラがデータを返さなかったため中断しました。');
      return null;
    }

    const { siteSetting, siteSchema, siteMarkdown } = result;
    const finalSchema = { ...baseSchema, ...siteSchema };
    const finalSetting = { ...baseSetting, ...siteSetting };

    const yaml = jsyaml.dump(finalSchema, {
      lineWidth: -1, // 折り返しを無効化
      noRefs: true, // 参照を無効化
      quotingType: '"',
    });
    const finalContent = `---
${yaml}
---
${siteMarkdown}`;

    // mdropサーバーへ送る（画像もローカル保存される）
    const mdrop = getMdropClient();
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

  const runClipper = async () => {
    if (busy) return;
    busy = true;
    setStatus('busy');
    try {
      const saved = await clip();
      setStatus(saved ? 'done' : 'idle', saved);
    } catch (e) {
      console.error('WebClipper Exception:', e);
      setStatus('error', e.message);
      alert(`クリップ処理中にエラーが発生しました。
${e.message}`);
    } finally {
      busy = false;
      console.log('Clipper End');
    }
  };

  // ボタンのツールチップ文言。done は保存先と画像数、error は原因を添える
  const buildTitle = (status, detail) => {
    if (status === 'done' && detail?.file) {
      const images = detail.images_found ? ` / 画像 ${detail.images_saved ?? 0}/${detail.images_found}` : '';
      return `保存済み: ${detail.file}${images}（クリックで再保存）`;
    }
    if (status === 'error' && detail) {
      return `保存に失敗: ${detail}（クリックで再試行）`;
    }
    return TITLES[status];
  };

  const createButton = () => {
    // すでにホスト要素が存在していれば何もしない
    if (document.getElementById(HOST_ID)) return;

    // Shadow DOM の土台となるホスト要素。元サイトのレイアウトを崩さないよう無害化してbodyへ追加
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = HOST_CSS;
    document.body.appendChild(host);

    // mode: 'closed' で元のサイトから隠蔽
    const shadowRoot = host.attachShadow({ mode: 'closed' });

    const btn = document.createElement('button');
    btn.id = 'webclipper-button';
    btn.style.cssText = BUTTON_CSS;

    let status = 'idle';
    let hovered = false;
    let resetTimer = null;

    const render = () => {
      const p = PALETTE[status];
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
      const title = buildTitle(next, detail);
      btn.title = title;
      btn.setAttribute('aria-label', title);
      render();
      // 失敗表示は一定時間で通常に戻す。保存済みは次の操作まで残す
      if (next === 'error') resetTimer = setTimeout(() => setStatus('idle'), ERROR_RESET_MS);
    };
    setStatus('idle');

    btn.onmouseenter = () => { hovered = true; render(); };
    btn.onmouseleave = () => { hovered = false; render(); };
    btn.onclick = (e) => {
      e.stopPropagation();
      runClipper();
    };

    shadowRoot.appendChild(btn);
  };

  // capture: true でサイト側の阻止を回避する
  document.addEventListener('keydown', (e) => {
    // Alt + Shift + X
    if (e.altKey && e.shiftKey && e.code === 'KeyX') {
      e.preventDefault();
      e.stopImmediatePropagation(); // 他のスクリプトに邪魔させない
      runClipper();
    }
  }, { capture: true });

  createButton();

  // テストは最後に登録されたコマンドを実行するので、クリッパー本体を最後に登録する
  const mdropClient = getMdropClient();
  if (mdropClient) GM_registerMenuCommand('🔑 mdropトークン設定', () => mdropClient.setToken());
  GM_registerMenuCommand('🚀 クリップして保存', runClipper);
})();
