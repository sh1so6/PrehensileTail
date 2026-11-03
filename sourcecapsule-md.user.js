// ==UserScript==
// @name         SourceCapsule → Custom Markdown
// @namespace    local.sourcecapsule-md
// @version      0.5.7
// @description  Reuse SourceCapsule extraction and save Markdown with custom frontmatter.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.x.com/*
// @match        https://mobile.twitter.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      pbs.twimg.com
// @connect      video.twimg.com
// @connect      abs.twimg.com
// @connect      cdn.syndication.twimg.com
// @connect      x.com
// @connect      twitter.com
// @connect      127.0.0.1
// @connect      localhost
// @connect      sourcecapsule-share.wolfgang-aura.workers.dev
// @run-at       document-start
// @noframes
// @require      http://127.0.0.1:18080/lib/mdrop-client.js
// @require      http://127.0.0.1:18080/lib/sourcecapsule-module.js
// @require      https://raw.githubusercontent.com/wolfgang-aura/SourceCapsule/ce343e8973d8aef9397ca209664ff416b3be4c37/sourcecapsule.user.js
// @updateURL    http://127.0.0.1:18080/sourcecapsule-md.user.js
// @downloadURL  http://127.0.0.1:18080/sourcecapsule-md.user.js
// ==/UserScript==

(() => {
  'use strict';

  const capsule = module.exports;
  if (typeof capsule.buildModelForPost !== 'function') {
    alert('SourceCapsule APIを読み込めませんでした。@requireの順序とURLを確認してください。');
    return;
  }

  const escapeText = (text = '') => String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_{}\[\]|])/g, '\\$1');
  function remoteUrl(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.href.replace(/[<>]/g, encodeURIComponent) : '';
    } catch { return ''; }
  }
  const linkTo = (label, url, image = false) => {
    const safe = remoteUrl(url);
    return safe ? `${image ? '!' : ''}[${escapeText(label)}](<${safe}>)` : '';
  };

  // SourceCapsule supplies sanitized inline HTML; parse it inertly, never insert it.
  function inlineMarkdown(html = '') {
    const root = new DOMParser().parseFromString(html, 'text/html').body;
    const walk = (node) => {
      if (node.nodeType === 3) return escapeText(node.textContent);
      if (node.nodeType !== 1) return '';
      const text = [...node.childNodes].map(walk).join('');
      switch (node.tagName) {
        case 'BR': return '\n';
        case 'SCRIPT': case 'STYLE': return '';
        case 'A': return remoteUrl(node.getAttribute('href'))
          ? `[${text}](<${remoteUrl(node.getAttribute('href'))}>)` : text;
        case 'IMG': return escapeText(node.getAttribute('alt') || '');
        case 'STRONG': case 'B': return `**${text}**`;
        case 'EM': case 'I': return `*${text}*`;
        case 'S': case 'DEL': return `~~${text}~~`;
        case 'CODE': return `<code>${escapeText(node.textContent)}</code>`;
        case 'P': case 'DIV': return `${text}\n`;
        default: return text;
      }
    };
    return [...root.childNodes].map(walk).join('').trim();
  }
  const indent = (text) => text.split('\n').map(line => `> ${line}`).join('\n');
  function avatarUrl(value) {
    const safe = remoteUrl(value);
    if (!safe) return '';
    const url = new URL(safe);
    // Match x.com.js: use X's small _normal avatar, not SourceCapsule's full size.
    if (url.hostname === 'pbs.twimg.com' && url.pathname.startsWith('/profile_images/')) {
      url.pathname = url.pathname.replace(/(?:_(?:normal|bigger|mini|\d+x\d+))?(\.[a-z0-9]+)$/i, '_normal$1');
    }
    return url.href;
  }
  function callout(post, label) {
    const author = post.author || {};
    const cell = text => escapeText(text).replace(/\r?\n/g, ' ');
    return indent([
      `[!${label}]${post.replyContext ? ' 返信先' : ''}`,
      `| ${linkTo('', avatarUrl(author.avatarUrl), true)} |${cell(author.name || '')} <br> ${cell(author.handle || '')} |`,
      '| --- | --- |',
      renderBlocks(post.blocks || []),
      post.truncated ? '※ 本文の一部が省略されています。' : '',
      label === 'quote' ? linkTo('元の投稿', post.sourceUrl) : '',
    ].join('\n'));
  }
  function renderBlocks(blocks) {
    return blocks.map(b => {
      switch (b.kind) {
        case 'paragraph': return inlineMarkdown(b.html);
        case 'heading': return `${'#'.repeat(Math.min(6, Math.max(1, b.level || 2)))} ${escapeText(b.text)}`;
        case 'image': return linkTo(b.alt || '', b.url, true);
        case 'video': return [linkTo('', b.posterUrl, true), linkTo('動画', b.mp4Url || b.sourceUrl)].filter(Boolean).join('\n');
        case 'quote': return callout(b, 'quote');
        case 'blockquote': return indent(renderBlocks(b.blocks || []));
        case 'list': return (b.items || []).map((item, i) =>
          `${b.ordered ? `${i + 1}.` : '-'} ${inlineMarkdown(item).replace(/\n/g, '\n    ')}`).join('\n');
        case 'code': {
          const fence = '`'.repeat(Math.max(3, ...(String(b.text || '').match(/`+/g) || []).map(s => s.length + 1)));
          return `${fence}\n${b.text || ''}\n${fence}`;
        }
        case 'divider': return '---';
        case 'link-card': return linkTo(b.title || b.url, b.url);
        case 'poll': return [escapeText(b.question || ''), ...(b.choices || []).map(c =>
          `- ${escapeText(c.label)}${c.percentage ? ` (${escapeText(c.percentage)})` : ''}`),
          escapeText(b.status || '')].filter(Boolean).join('\n');
        case 'truncation-notice': return '※ 本文の一部が省略されています。';
        case 'quote-tombstone': return `※ ${escapeText(b.notice || '引用投稿を取得できませんでした。')}`;
        case 'note-recovered': return '';
        default: return `※ 未対応の内容: ${escapeText(b.kind)}`;
      }
    }).filter(Boolean).join('\n\n');
  }
  function postTitle(model) {
    const paragraph = model.blocks?.find(b => b.kind === 'paragraph');
    const text = new DOMParser().parseFromString(
      (paragraph?.html || '').replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent;
    // Count Unicode code points so an emoji at the limit is never split in half.
    return (model.heading || `${model.author?.name || model.author?.handle || 'X post'}「${Array.from(text).slice(0, 30).join('')}」`).toWellFormed();
  }

  function formatMarkdown(model) {
    const name = model.author?.name || model.author?.handle || '';
    const handle = model.author?.handle?.replace(/^@/, '') || '';
    const fields = {
      title: postTitle(model),
      source: model.sourceUrl || '',
      author: name ? `@${name.replace(/^@/, '')}` : '',
      published: model.publishedAt?.split('T')[0] || '',
      created: model.exportedAt?.split('T')[0] || '',
      description: '',
      tags: ['Twitter/ref', 'X/ref', 'Touite/ref'],
      url: model.sourceUrl || '',
      userID: handle ? `https://x.com/${encodeURIComponent(handle.toWellFormed())}` : '',
      profile: name,
    };
    // JSON strings/arrays are valid YAML and safely quote multiline values.
    const yaml = Object.entries(fields)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
    return `---\n${yaml}\n---\n# Post\n${callout(model, 'Post')}\n\n# Embed\n${linkTo('', model.sourceUrl, true)}\n`;
  }

  let busy = false;
  async function enrichContext(model) {
    const cache = new Map();
    const failures = new Set();
    // Upstream's quote enricher/fetcher are private. Reuse its public transforms
    // and injectable focused/reply enrichers with the same syndication endpoint.
    async function fetchTweet(id) {
      if (!cache.has(id)) {
        cache.set(id, new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&lang=en&token=${capsule.syndicationToken(id)}`,
            responseType: 'text', timeout: 20000,
            onload: response => {
              try {
                if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
                const data = JSON.parse(response.responseText);
                if (!data?.user || data.text == null) throw new Error('投稿データがありません');
                resolve(data);
              } catch (error) { reject(error); }
            },
            onerror: () => reject(new Error('通信エラー')),
            ontimeout: () => reject(new Error('タイムアウト')),
          });
        }));
      }
      try { return await cache.get(id); }
      catch (error) { failures.add(id); throw error; }
    }
    await capsule.recoverMissingQuoteSourcesViaSyndication(model);
    await capsule.enrichFocusedPostViaSyndication(model, null, fetchTweet);
    await capsule.enrichReplyContextViaSyndication(model, null, fetchTweet);
    async function enrichQuotes(blocks, ancestors = new Set()) {
      for (const quote of blocks) {
        if (quote.kind !== 'quote') continue;
        const id = quote.sourceUrl?.match(/\/status\/(\d+)/)?.[1];
        if (!id || ancestors.has(id)) continue;
        try {
          const fresh = capsule.mergeQuoteAfterSyndication(quote,
            capsule.syndicationToQuoteBlock(await fetchTweet(id)));
          Object.assign(quote, fresh);
          if (quote.truncated) capsule.recoverQuoteNoteText(quote, capsule.getCapturedNoteTweet(id));
        } catch (error) {
          console.warn('[SourceCapsule MD] 引用を補完できませんでした', id, error);
        }
        // Match upstream DOM quote depth; avoid expanding an unbounded quote chain.
        if (ancestors.size < 2) await enrichQuotes(quote.blocks || [], new Set([...ancestors, id]));
      }
    }
    await enrichQuotes(model.blocks);
    model.blocks = capsule.dedupeQuoteCards(model.blocks);
    if (failures.size) model.blocks.push({ kind: 'paragraph',
      html: '※ 引用元・返信先の追加取得に失敗した投稿があります。取得済みの内容のみ保存しています。' });
  }

  /**
   * Advanced URI 経由で Obsidian に新規ノートを作成する（クリップボード汚染対策つき）。
   * - 短い本文: data= に直接載せ、クリップボードを使わない。
   * - 長い本文: Chromium(Windows) は 2048 文字超の外部プロトコル URL を黙って破棄するため
   *   クリップボード経由で送り、ブラウザへフォーカスが戻った時点で消去する。
   */
  const OBSIDIAN_URI_MAX = 2000;
  const CLIPBOARD_WIPE_DELAY = 3000; // フォーカス復帰後、Obsidian の読み取り完了を待つ猶予
  const CLIPBOARD_WIPE_MIN_AGE = 10_000; // 送信から最低この時間は消さない（確認ダイアログ＋コールドスタート対策）
  const CLIPBOARD_WIPE_FALLBACK = 60_000; // 一度も離脱しなかった（起動キャンセル等）場合
  let cancelClipboardWipe = null;

  // Obsidian の Vault ID は公開リポジトリに載せず、Tampermonkey のストレージに保存する。
  const VAULT_KEY = 'obsidian.vault';
  function getVault(forcePrompt = false) {
    let vault = forcePrompt ? '' : String(GM_getValue(VAULT_KEY, '') ?? '').trim();
    if (!vault) {
      vault = String(prompt('ObsidianのVault ID（またはVault名）を入力してください') ?? '').trim();
      if (vault) GM_setValue(VAULT_KEY, vault);
    }
    return vault;
  }

  async function sendToObsidian({ vault, filepath, content, open }) {
    cancelClipboardWipe?.();
    const base = `obsidian://adv-uri?vault=${encodeURIComponent(vault)}` +
      `&filepath=${encodeURIComponent(filepath.toWellFormed())}&mode=new`;
    const body = content.toWellFormed();
    // encodeURIComponent は 1 文字あたり最小 1 文字なので、長文は符号化せずに判定できる
    if (base.length + 6 + body.length <= OBSIDIAN_URI_MAX) {
      const direct = `${base}&data=${encodeURIComponent(body)}`;
      if (direct.length <= OBSIDIAN_URI_MAX) { open(direct); return 'uri'; }
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('クリップボードへのコピーが完了しませんでした。')), 5000);
      const done = () => { clearTimeout(timer); resolve(); };
      try { GM_setClipboard(content, 'text', done)?.then?.(done, reject); }
      catch (error) { clearTimeout(timer); reject(error); }
    });
    open(`${base}&clipboard=true`);
    cancelClipboardWipe = scheduleClipboardWipe(content);
    return 'clipboard';
  }

  function scheduleClipboardWipe(content) {
    const normalize = text => text.replace(/\r\n/g, '\n');
    const expected = normalize(content);
    const sentAt = Date.now();
    let left = false, done = false, pending = null;
    const cancel = () => {
      done = true;
      clearTimeout(pending); clearTimeout(fallback);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('copy', cancel, true);
      document.removeEventListener('cut', cancel, true);
      if (cancelClipboardWipe === cancel) cancelClipboardWipe = null;
    };
    const stillOurs = async () => {
      try {
        const { state } = await navigator.permissions.query({ name: 'clipboard-read' });
        if (state !== 'granted') return true; // 照合不可（プロンプトは出さない）→ 消去
        return normalize(await navigator.clipboard.readText()) === expected;
      } catch { return true; }
    };
    const wipe = async () => {
      if (done) return;
      cancel();
      if (!(await stillOurs())) return;
      try { await navigator.clipboard.writeText(''); }
      catch { try { GM_setClipboard('', 'text'); } catch {} }
    };
    const armWipe = () => {
      clearTimeout(pending);
      // 確認ダイアログ閉鎖直後の一時的な復帰を除外するため、猶予後もフォーカス保持なら消去
      const delay = Math.max(CLIPBOARD_WIPE_DELAY, sentAt + CLIPBOARD_WIPE_MIN_AGE - Date.now());
      // フォーカスを失っていたら次の focus で再アームする
      pending = setTimeout(() => { if (document.hasFocus()) wipe(); }, delay);
    };
    const onBlur = () => { left = true; clearTimeout(pending); };
    const onFocus = () => { if (left) armWipe(); };
    const fallback = setTimeout(() => { left = true; if (document.hasFocus()) armWipe(); }, CLIPBOARD_WIPE_FALLBACK);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    // ページ内で別の内容をコピーしたら、もう自分のデータではないので消さない
    document.addEventListener('copy', cancel, true);
    document.addEventListener('cut', cancel, true);
    return cancel;
  }

  async function saveMarkdown(targetTweet = null, trigger = null, destination = 'obsidian') {
    if (busy) return;
    busy = true;
    let delivered = false;
    if (trigger) { trigger.disabled = true; trigger.textContent = '取得中…'; }
    try {
      if (!targetTweet && !/\/status\/\d+\/?$/.test(location.pathname) &&
          !/^\/i\/articles?\/\d+\/?$/.test(location.pathname)) {
        throw new Error('保存したい投稿または記事の個別ページを開いてください。');
      }
      const type = targetTweet ? 'post' : capsule.detectPageType();
      if (!type) throw new Error('投稿本文の読み込みを待ってから実行してください。');
      if (targetTweet && capsule.timelineArticlePreviewReason(targetTweet)) {
        throw new Error('この記事・投稿はプレビュー表示です。個別ページを開き、メニューから保存してください。');
      }
      capsule.resetMediaState();
      const model = type === 'article'
        ? capsule.buildModelForArticle()
        : capsule.buildModelForPost(targetTweet, { includeThread: false });
      capsule.recoverMissingQuoteSourcesFromCapture(model);
      await enrichContext(model);
      // ponytail: capture the current post only; full export loading is private upstream.
      const markdown = formatMarkdown(model);
      const title = Array.from(postTitle(model)
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')).slice(0, 100).join('').replace(/[. ]+$/, '');
      if (destination === 'obsidian') {
        // mdropが起動していればそちらへ保存（画像もローカル化）。未起動ならnullで従来経路へ
        const report = await globalThis.MdropClient?.trySend({
          path: 'Clippings/x.com', name: title, content: markdown, source: location.href,
        });
        if (report) { delivered = true; return; }
        // Advanced URI mode。Vault は初回に入力して保存する。
        const vault = getVault();
        if (!vault) throw new Error('Vault IDが未設定です。メニューの「ObsidianのVault IDを設定」から入力してください。');
        await sendToObsidian({
          vault, filepath: `Clippings/x.com/${title}.md`, content: markdown,
          open: uri => {
            const link = document.createElement('a');
            link.href = uri;
            document.body.append(link);
            try { link.click(); } finally { link.remove(); }
          },
        });
        delivered = true;
        return;
      }
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title}.md`;
      document.body.append(link);
      try { link.click(); } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      delivered = true;
    } catch (error) {
      console.error('[SourceCapsule MD]', error);
      alert(`Markdown保存に失敗しました。\n${error.message}`);
    } finally {
      busy = false;
      if (trigger) {
        trigger.disabled = false;
        trigger.textContent = delivered ? '✓ 完了' : '保存';
        trigger.title = delivered ? 'Obsidianへ送信済み（クリックで再送）' : 'この投稿を独自MarkdownでObsidianへ送る';
        trigger.setAttribute('aria-label', trigger.title);
      }
    }
  }

  GM_registerMenuCommand('現在の投稿・記事をObsidianへ送る', () => saveMarkdown());
  GM_registerMenuCommand('ObsidianのVault IDを設定', () => getVault(true));
  GM_registerMenuCommand('現在の投稿・記事を.mdでダウンロード', () => saveMarkdown(null, null, 'download'));

  // Keep upstream controls mounted: removing them makes its observer recreate them.
  // Hide and block their clicks without changing upstream's private functions.
  const style = document.createElement('style');
  style.textContent = `
    .xa-ctl, .xa-ctl-menu { display: none !important; }
    .scmd-save { border: 1px solid currentColor; border-radius: 999px;
      display: inline-flex; flex: 0 0 auto; align-self: flex-start;
      align-items: center; justify-content: center; box-sizing: border-box;
      width: max-content; height: 28px; white-space: nowrap; writing-mode: horizontal-tb;
      padding: 3px 9px; margin: 4px; background: transparent; color: inherit;
      font: inherit; font-size: 12px; cursor: pointer; }
    .scmd-save:disabled { opacity: .5; cursor: wait; }
  `;
  const articleSelector = '[data-testid="twitterArticleReadView"], [data-testid="twitterArticleRichTextView"], [data-testid="twitterArticleReader"]';
  const saveOwnerSelector = `article[data-testid="tweet"], ${articleSelector}`;
  function ensurePostButtons() {
    if (!style.isConnected) (document.head || document.documentElement).append(style);
    const posts = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const article = document.querySelector(articleSelector);
    if (article && !article.closest('article[data-testid="tweet"]')) posts.push(article);
    for (const post of posts) {
      if ([...post.querySelectorAll('.scmd-save')].some(button =>
        button.closest(saveOwnerSelector) === post)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scmd-save';
      button.textContent = '保存';
      button.title = 'この投稿を独自MarkdownでObsidianへ送る';
      button.setAttribute('aria-label', button.title);
      const caret = post.querySelector('[data-testid="caret"]');
      if (caret?.parentElement) caret.before(button);
      else post.append(button);
    }
  }
  document.addEventListener('click', event => {
    const element = event.target instanceof Element ? event.target : null;
    const button = element?.closest('.scmd-save');
    if (!button && !element?.closest('.xa-ctl, .xa-ctl-menu')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button) {
      const owner = button.closest(saveOwnerSelector);
      if (owner?.matches(articleSelector) || owner?.querySelector(articleSelector)) void saveMarkdown(null, button);
      else if (owner) void saveMarkdown(owner, button);
    }
  }, true);
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensurePostButtons();
    });
  });
  observer.observe(document, { childList: true, subtree: true });
  ensurePostButtons();
})();
