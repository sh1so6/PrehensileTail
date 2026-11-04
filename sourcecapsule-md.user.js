// ==UserScript==
// @name         SourceCapsule → Custom Markdown
// @namespace    local.sourcecapsule-md
// @version      0.7.0
// @description  Reuse SourceCapsule extraction and save Markdown with custom frontmatter.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.x.com/*
// @match        https://mobile.twitter.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
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
// @require      https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/lib/mdrop-client.js?v=0.7.0
// @require      https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/lib/sourcecapsule-module.js?v=0.7.0
// @require      https://raw.githubusercontent.com/wolfgang-aura/SourceCapsule/3738b57c43ab7eef898086a9f1e5a5c3c907d4e8/sourcecapsule.user.js
// @updateURL    https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/sourcecapsule-md.user.js
// @downloadURL  https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/sourcecapsule-md.user.js
// ==/UserScript==

(() => {
  'use strict';

  const capsule = module.exports;
  if (typeof capsule.buildModelForPost !== 'function') {
    alert('SourceCapsule APIを読み込めませんでした。@requireの順序とURLを確認してください。');
    return;
  }

  // ---------------------------------------------------------------------------
  // 定数
  // ---------------------------------------------------------------------------
  const LOG_PREFIX = '[SourceCapsule MD]';
  const CLIP_DIR = 'Clippings/x.com'; // mdrop の保存先フォルダ（Vault 内）
  const TITLE_PREVIEW_CHARS = 30; // 見出しの無い投稿で、本文から取るタイトルの文字数（コードポイント）
  const FILENAME_MAX_CHARS = 100; // ファイル名（拡張子除く）の最大文字数（コードポイント）
  const FALLBACK_TITLE = 'X post'; // サニタイズ後のファイル名が空になった場合
  const SYNDICATION_TIMEOUT_MS = 20_000;
  const MAX_QUOTE_DEPTH = 2; // 上流の DOM 取得と同じ引用の深さ。無限に辿らない
  const BLOB_URL_REVOKE_DELAY_MS = 60_000; // ダウンロード開始後に Blob URL を解放するまでの猶予
  const TRUNCATED_NOTICE = '※ 本文の一部が省略されています。';
  const FETCH_FAILED_NOTICE =
    '※ 引用元・返信先の追加取得に失敗した投稿があります。取得済みの内容のみ保存しています。';

  // UI
  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const ARTICLE_SELECTOR = [
    '[data-testid="twitterArticleReadView"]',
    '[data-testid="twitterArticleRichTextView"]',
    '[data-testid="twitterArticleReader"]',
  ].join(', ');
  const SAVE_OWNER_SELECTOR = `${TWEET_SELECTOR}, ${ARTICLE_SELECTOR}`;
  const UPSTREAM_CONTROL_SELECTOR = '.xa-ctl, .xa-ctl-menu';
  const BUTTON_LABEL = '保存';
  const BUTTON_TITLE = 'この投稿を独自Markdownでmdropへ保存';

  // ---------------------------------------------------------------------------
  // Markdown 生成（出力形式は Playwright テストが検証するため変更しないこと）
  // ---------------------------------------------------------------------------
  const escapeText = (text = '') => String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_{}\[\]|])/g, '\\$1');

  // http(s) 以外・不正な URL は空文字にする
  function remoteUrl(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.href.replace(/[<>]/g, encodeURIComponent) : '';
    } catch {
      return '';
    }
  }

  const linkTo = (label, url, image = false) => {
    const safe = remoteUrl(url);
    return safe ? `${image ? '!' : ''}[${escapeText(label)}](<${safe}>)` : '';
  };

  // SourceCapsule supplies sanitized inline HTML; parse it inertly, never insert it.
  function inlineMarkdown(html = '') {
    const root = new DOMParser().parseFromString(html, 'text/html').body;
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent);
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const text = [...node.childNodes].map(walk).join('');
      switch (node.tagName) {
        case 'BR': return '\n';
        case 'SCRIPT': case 'STYLE': return '';
        case 'A': {
          const href = remoteUrl(node.getAttribute('href'));
          return href ? `[${text}](<${href}>)` : text;
        }
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

  const toBlockquote = (text) => text.split('\n').map(line => `> ${line}`).join('\n');

  // アバターは SourceCapsule の原寸ではなく、X 標準の小さい _normal サイズにする。
  function avatarUrl(value) {
    const safe = remoteUrl(value);
    if (!safe) return '';
    const url = new URL(safe);
    if (url.hostname === 'pbs.twimg.com' && url.pathname.startsWith('/profile_images/')) {
      url.pathname = url.pathname.replace(
        /(?:_(?:normal|bigger|mini|\d+x\d+))?(\.[a-z0-9]+)$/i, '_normal$1');
    }
    return url.href;
  }

  // 投稿者の表ヘッダー付きの callout（[!Post] / [!quote]）
  function callout(post, label) {
    const author = post.author || {};
    const cell = text => escapeText(text).replace(/\r?\n/g, ' ');
    return toBlockquote([
      `[!${label}]${post.replyContext ? ' 返信先' : ''}`,
      `| ${linkTo('', avatarUrl(author.avatarUrl), true)} |` +
        `${cell(author.name || '')} <br> ${cell(author.handle || '')} |`,
      '| --- | --- |',
      renderBlocks(post.blocks || []),
      post.truncated ? TRUNCATED_NOTICE : '',
      label === 'quote' ? linkTo('元の投稿', post.sourceUrl) : '',
    ].join('\n'));
  }

  function renderVideo(block) {
    return [
      linkTo('', block.posterUrl, true),
      linkTo('動画', block.mp4Url || block.sourceUrl),
    ].filter(Boolean).join('\n');
  }

  function renderList(block) {
    return (block.items || []).map((item, i) => {
      const marker = block.ordered ? `${i + 1}.` : '-';
      return `${marker} ${inlineMarkdown(item).replace(/\n/g, '\n    ')}`;
    }).join('\n');
  }

  // 本文中のバッククォート列より長いフェンスを使う
  function renderCode(block) {
    const text = String(block.text || '');
    const runs = (text.match(/`+/g) || []).map(run => run.length + 1);
    const fence = '`'.repeat(Math.max(3, ...runs));
    return `${fence}\n${block.text || ''}\n${fence}`;
  }

  function renderPoll(block) {
    const choices = (block.choices || []).map(choice =>
      `- ${escapeText(choice.label)}${choice.percentage ? ` (${escapeText(choice.percentage)})` : ''}`);
    return [escapeText(block.question || ''), ...choices, escapeText(block.status || '')]
      .filter(Boolean).join('\n');
  }

  function renderBlock(block) {
    switch (block.kind) {
      case 'paragraph': return inlineMarkdown(block.html);
      case 'heading':
        return `${'#'.repeat(Math.min(6, Math.max(1, block.level || 2)))} ${escapeText(block.text)}`;
      case 'image': return linkTo(block.alt || '', block.url, true);
      case 'video': return renderVideo(block);
      case 'quote': return callout(block, 'quote');
      case 'blockquote': return toBlockquote(renderBlocks(block.blocks || []));
      case 'list': return renderList(block);
      case 'code': return renderCode(block);
      case 'divider': return '---';
      case 'link-card': return linkTo(block.title || block.url, block.url);
      case 'poll': return renderPoll(block);
      case 'truncation-notice': return TRUNCATED_NOTICE;
      case 'quote-tombstone':
        return `※ ${escapeText(block.notice || '引用投稿を取得できませんでした。')}`;
      case 'note-recovered': return ''; // 本文へ反映済みなので出力しない
      default: return `※ 未対応の内容: ${escapeText(block.kind)}`;
    }
  }

  function renderBlocks(blocks) {
    return blocks.map(renderBlock).filter(Boolean).join('\n\n');
  }

  function postTitle(model) {
    const paragraph = model.blocks?.find(b => b.kind === 'paragraph');
    const text = new DOMParser().parseFromString(
      (paragraph?.html || '').replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent;
    // Count Unicode code points so an emoji at the limit is never split in half.
    const preview = Array.from(text).slice(0, TITLE_PREVIEW_CHARS).join('');
    const author = model.author?.name || model.author?.handle || 'X post';
    return (model.heading || `${author}「${preview}」`).toWellFormed();
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
    return `---\n${yaml}\n---\n# Post\n${callout(model, 'Post')}\n\n` +
      `# Embed\n${linkTo('', model.sourceUrl, true)}\n`;
  }

  // ---------------------------------------------------------------------------
  // 引用・返信先の補完（syndication）
  // ---------------------------------------------------------------------------
  // Upstream's quote enricher/fetcher are private. Reuse its public transforms
  // and injectable focused/reply enrichers with the same syndication endpoint.
  function createTweetFetcher() {
    const cache = new Map();
    const failures = new Set();

    const request = id => new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://cdn.syndication.twimg.com/tweet-result' +
          `?id=${encodeURIComponent(id)}&lang=en&token=${capsule.syndicationToken(id)}`,
        responseType: 'text',
        timeout: SYNDICATION_TIMEOUT_MS,
        onload: response => {
          try {
            if (response.status < 200 || response.status >= 300) {
              throw new Error(`HTTP ${response.status}`);
            }
            const data = JSON.parse(response.responseText);
            if (!data?.user || data.text == null) throw new Error('投稿データがありません');
            resolve(data);
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error('通信エラー')),
        ontimeout: () => reject(new Error('タイムアウト')),
      });
    });

    // 同じ ID は 1 回だけ取得する。失敗した ID は failures に記録する。
    async function fetchTweet(id) {
      if (!cache.has(id)) cache.set(id, request(id));
      try {
        return await cache.get(id);
      } catch (error) {
        failures.add(id);
        throw error;
      }
    }
    return { fetchTweet, failures };
  }

  async function enrichQuotes(blocks, fetchTweet, ancestors = new Set()) {
    for (const quote of blocks) {
      if (quote.kind !== 'quote') continue;
      const id = quote.sourceUrl?.match(/\/status\/(\d+)/)?.[1];
      if (!id || ancestors.has(id)) continue;
      try {
        const fresh = capsule.mergeQuoteAfterSyndication(
          quote, capsule.syndicationToQuoteBlock(await fetchTweet(id)));
        Object.assign(quote, fresh);
        if (quote.truncated) capsule.recoverQuoteNoteText(quote, capsule.getCapturedNoteTweet(id));
      } catch (error) {
        console.warn(`${LOG_PREFIX} 引用を補完できませんでした`, id, error);
      }
      // Match upstream DOM quote depth; avoid expanding an unbounded quote chain.
      if (ancestors.size < MAX_QUOTE_DEPTH) {
        await enrichQuotes(quote.blocks || [], fetchTweet, new Set([...ancestors, id]));
      }
    }
  }

  async function enrichContext(model) {
    const { fetchTweet, failures } = createTweetFetcher();
    await capsule.recoverMissingQuoteSourcesViaSyndication(model);
    await capsule.enrichFocusedPostViaSyndication(model, null, fetchTweet);
    await capsule.enrichReplyContextViaSyndication(model, null, fetchTweet);
    await enrichQuotes(model.blocks, fetchTweet);
    model.blocks = capsule.dedupeQuoteCards(model.blocks);
    if (failures.size) model.blocks.push({ kind: 'paragraph', html: FETCH_FAILED_NOTICE });
  }

  // ---------------------------------------------------------------------------
  // 保存処理
  // ---------------------------------------------------------------------------
  // 一時的な <a> を作ってクリックする（Blob ダウンロード用）
  function clickLink(href, download = null) {
    const link = document.createElement('a');
    link.href = href;
    if (download !== null) link.download = download;
    document.body.append(link);
    try { link.click(); } finally { link.remove(); }
  }

  function downloadMarkdown(markdown, title) {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    try {
      clickLink(url, `${title}.md`);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_REVOKE_DELAY_MS);
    }
  }

  // mdrop へ保存する（画像もローカル化される）。未起動などで送れなければエラーにする。
  async function sendMarkdownToMdrop(markdown, title) {
    if (!globalThis.MdropClient) {
      throw new Error('mdrop クライアント(lib/mdrop-client.js)を読み込めませんでした。@requireのURLを確認してください。');
    }
    const report = await globalThis.MdropClient.trySend({
      path: CLIP_DIR, name: title, content: markdown, source: location.href,
    });
    if (!report) throw new Error('mdropに接続できませんでした。mdropが起動していること、トークンを入力済みであることを確認してもう一度実行してください。');
  }

  // OS のファイル名に使えない文字を置換し、末尾の . と空白を除く
  function fileTitle(model) {
    const name = Array.from(postTitle(model).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'))
      .slice(0, FILENAME_MAX_CHARS).join('').replace(/[. ]+$/, '');
    return name || FALLBACK_TITLE;
  }

  function assertSavablePage(targetTweet) {
    if (targetTweet) return;
    const { pathname } = location;
    if (!/\/status\/\d+\/?$/.test(pathname) && !/^\/i\/articles?\/\d+\/?$/.test(pathname)) {
      throw new Error('保存したい投稿または記事の個別ページを開いてください。');
    }
  }

  // 現在のページ（または指定したタイムライン上の投稿）から model を作る。
  // 同期関数のまま保つこと（検証エラーを保存処理の先頭で即座に通知するため）。
  function captureModel(targetTweet) {
    assertSavablePage(targetTweet);
    const type = targetTweet ? 'post' : capsule.detectPageType();
    if (!type) throw new Error('投稿本文の読み込みを待ってから実行してください。');
    if (targetTweet && capsule.timelineArticlePreviewReason(targetTweet)) {
      throw new Error('この記事・投稿はプレビュー表示です。個別ページを開き、メニューから保存してください。');
    }
    capsule.resetMediaState();
    // 現在の投稿のみ取得する。全件エクスポートの読み込みは上流の非公開関数。
    const model = type === 'article'
      ? capsule.buildModelForArticle()
      : capsule.buildModelForPost(targetTweet, { includeThread: false });
    capsule.recoverMissingQuoteSourcesFromCapture(model);
    return model;
  }

  function setButtonBusy(button) {
    button.disabled = true;
    button.textContent = '取得中…';
  }

  function setButtonResult(button, delivered) {
    button.disabled = false;
    button.textContent = delivered ? '✓ 完了' : BUTTON_LABEL;
    button.title = delivered ? 'mdropへ保存済み（クリックで再保存）' : BUTTON_TITLE;
    button.setAttribute('aria-label', button.title);
  }

  let busy = false;
  async function saveMarkdown(targetTweet = null, trigger = null, destination = 'mdrop') {
    if (busy) return;
    busy = true;
    let delivered = false;
    if (trigger) setButtonBusy(trigger);
    try {
      const model = captureModel(targetTweet);
      await enrichContext(model);
      const markdown = formatMarkdown(model);
      const title = fileTitle(model);
      if (destination === 'mdrop') await sendMarkdownToMdrop(markdown, title);
      else downloadMarkdown(markdown, title);
      delivered = true;
    } catch (error) {
      console.error(LOG_PREFIX, error);
      alert(`Markdown保存に失敗しました。\n${error.message}`);
    } finally {
      busy = false;
      if (trigger) setButtonResult(trigger, delivered);
    }
  }

  GM_registerMenuCommand('現在の投稿・記事をmdropへ保存', () => saveMarkdown());
  GM_registerMenuCommand('🔑 mdropトークン設定', () => globalThis.MdropClient?.setToken());
  GM_registerMenuCommand('現在の投稿・記事を.mdでダウンロード', () => saveMarkdown(null, null, 'download'));

  // ---------------------------------------------------------------------------
  // 投稿ごとの保存ボタン
  // ---------------------------------------------------------------------------
  // Keep upstream controls mounted: removing them makes its observer recreate them.
  // Hide and block their clicks without changing upstream's private functions.
  const style = document.createElement('style');
  style.textContent = `
    ${UPSTREAM_CONTROL_SELECTOR} { display: none !important; }
    .scmd-save { border: 1px solid currentColor; border-radius: 999px;
      display: inline-flex; flex: 0 0 auto; align-self: flex-start;
      align-items: center; justify-content: center; box-sizing: border-box;
      width: max-content; height: 28px; white-space: nowrap; writing-mode: horizontal-tb;
      padding: 3px 9px; margin: 4px; background: transparent; color: inherit;
      font: inherit; font-size: 12px; cursor: pointer; }
    .scmd-save:disabled { opacity: .5; cursor: wait; }
  `;

  function createSaveButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scmd-save';
    button.textContent = BUTTON_LABEL;
    button.title = BUTTON_TITLE;
    button.setAttribute('aria-label', BUTTON_TITLE);
    return button;
  }

  function ensurePostButtons() {
    if (!style.isConnected) (document.head || document.documentElement).append(style);
    const posts = [...document.querySelectorAll(TWEET_SELECTOR)];
    const article = document.querySelector(ARTICLE_SELECTOR);
    if (article && !article.closest(TWEET_SELECTOR)) posts.push(article);
    for (const post of posts) {
      const hasButton = [...post.querySelectorAll('.scmd-save')]
        .some(button => button.closest(SAVE_OWNER_SELECTOR) === post);
      if (hasButton) continue;
      const button = createSaveButton();
      const caret = post.querySelector('[data-testid="caret"]');
      if (caret?.parentElement) caret.before(button);
      else post.append(button);
    }
  }

  // 上流のボタンは無効化し、自前のボタンは保存処理へ回す（capture 段階で先に処理）
  function onDocumentClick(event) {
    const element = event.target instanceof Element ? event.target : null;
    const button = element?.closest('.scmd-save');
    if (!button && !element?.closest(UPSTREAM_CONTROL_SELECTOR)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!button) return;
    const owner = button.closest(SAVE_OWNER_SELECTOR);
    if (!owner) return;
    // 記事ビュー（または記事を含む投稿）はページ全体から、通常の投稿は対象要素から取得する
    const isArticle = owner.matches(ARTICLE_SELECTOR) || owner.querySelector(ARTICLE_SELECTOR);
    void saveMarkdown(isArticle ? null : owner, button);
  }

  // リスナーと Observer はページ（SPA）が生きている間ずっと必要なので解除しない。
  document.addEventListener('click', onDocumentClick, true);
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensurePostButtons();
    });
  }).observe(document, { childList: true, subtree: true });
  ensurePostButtons();
})();
