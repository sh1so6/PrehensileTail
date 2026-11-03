// ==UserScript==
// @name         XClipper → Obsidian One Click
// @namespace    https://x.com/
// @version      0.1.1
// @description  Add a one-click "Send to Obsidian" button to X posts via XClipper.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @updateURL   https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/xclipper.user.js
// @downloadURL https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/xclipper.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const LOG_PREFIX = '[X → Obsidian]';
  const BUTTON_ATTR = 'data-xclipper-obsidian-button';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // XClipper本体と同じ探索条件
  const ARTICLE_SELECTOR = 'article[role="article"]';
  const ACTION_BAR_SELECTORS = [
    'div[role="group"][id^="id__"]',
    'div[role="group"]',
  ];
  const STATUS_LINK_SELECTOR = 'a[href*="/status/"]';

  const IDLE_COLOR = 'rgb(113,118,123)';
  const HOVER_COLOR = 'rgb(124, 58, 237)';
  const HOVER_BACKGROUND = 'rgba(124, 58, 237, .10)';

  const BUTTON_LABEL = 'Send to Obsidian';
  const BUTTON_TITLE = 'Send to Obsidian via XClipper';

  // XClipperが拾うURLハッシュとイベント名
  const AUTO_EXTRACT_HASH = '#xclipper=obsidian&xclipper_single=1';
  const AUTO_EXTRACT_EVENT = 'xclipper:autoextract';

  const BUTTON_STYLE = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'cursor:pointer',
    `color:${IDLE_COLOR}`,
    'padding:8px',
    'border-radius:9999px',
    'transition:background-color .15s,color .15s',
    'user-select:none',
  ].join(';');

  const CONTAINER_STYLE = 'display:flex;align-items:center;';

  const ICON_STYLE = {
    width: '1.25em',
    height: '1.25em',
    display: 'block',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  // シンプルな「ノートへ送る」アイコン
  const ICON_PATHS = [
    'M6 3.5h8l4 4V20.5H6z',
    'M14 3.5v4h4M9 12h6M9 16h4',
  ];

  const decorated = new WeakSet();

  /** tweet内のstatus permalinkを取得する（XClipperと同じ方針）。 */
  function getStatusUrl(article) {
    const timeLink = article.querySelector(`${STATUS_LINK_SELECTOR} time`)?.closest('a');

    if (timeLink?.href) {
      return timeLink.href;
    }

    // fallback
    for (const link of article.querySelectorAll(STATUS_LINK_SELECTOR)) {
      if (/\/status\/\d+/.test(link.href)) {
        return link.href;
      }
    }

    return null;
  }

  /** `origin/user/status/id` 形式に揃える。status URLでなければnull。 */
  function normalizeStatusUrl(url) {
    try {
      const u = new URL(url, location.href);
      const match = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/);

      return match ? `${u.origin}/${match[1]}/status/${match[2]}` : null;
    } catch {
      return null;
    }
  }

  /**
   * XClipperにObsidian exportを依頼する。
   * - 対象tweetのpermalinkを表示中: CustomEventでその場実行
   * - timeline上: permalink + auto-extractハッシュを新規タブで開く
   */
  function sendToObsidian(article) {
    const statusUrl = getStatusUrl(article);

    if (!statusUrl) {
      console.warn(`${LOG_PREFIX} status URL not found`);
      return;
    }

    const target = normalizeStatusUrl(statusUrl);
    const current = normalizeStatusUrl(location.href);

    if (target && current && target === current) {
      window.dispatchEvent(
        new CustomEvent(AUTO_EXTRACT_EVENT, {
          detail: { action: 'obsidian', single: true },
        })
      );
      return;
    }

    window.open(statusUrl.split('#')[0] + AUTO_EXTRACT_HASH, '_blank', 'noopener');
  }

  function createSvgPath(d) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    return path;
  }

  function buildIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    Object.assign(svg.style, ICON_STYLE);
    svg.append(...ICON_PATHS.map(createSvgPath));

    return svg;
  }

  function makeButton(article) {
    const button = document.createElement('div');

    button.setAttribute(BUTTON_ATTR, '1');
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-label', BUTTON_LABEL);
    button.title = BUTTON_TITLE;
    button.style.cssText = BUTTON_STYLE;
    button.appendChild(buildIcon());

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = HOVER_BACKGROUND;
      button.style.color = HOVER_COLOR;
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '';
      button.style.color = button.dataset.idleColor || IDLE_COLOR;
    });

    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      sendToObsidian(article);
    };

    button.addEventListener('click', activate);
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        activate(event);
      }
    });

    return button;
  }

  /** 隣のアクションアイコンのサイズ・色に合わせる（XClipper本体と同じ）。 */
  function matchSiblingIcon(actionBar, button) {
    const ourSvg = button.querySelector('svg');
    const reference = [...actionBar.querySelectorAll('svg')]
      .find(svg => !svg.closest(`[${BUTTON_ATTR}]`));

    if (!reference || !ourSvg) {
      return;
    }

    const rect = reference.getBoundingClientRect();

    if (rect.width > 0) {
      ourSvg.style.width = `${rect.width}px`;
      ourSvg.style.height = `${rect.height}px`;
    }

    const { fill, color } = getComputedStyle(reference);
    const idleColor = fill && fill !== 'none' ? fill : color;

    if (idleColor) {
      button.dataset.idleColor = idleColor;
      button.style.color = idleColor;
    }
  }

  function findActionBar(article) {
    for (const selector of ACTION_BAR_SELECTORS) {
      const bar = article.querySelector(selector);

      if (bar) {
        return bar;
      }
    }

    return null;
  }

  function decorateArticle(article) {
    if (decorated.has(article)) {
      return;
    }

    const actionBar = findActionBar(article);

    if (!actionBar) {
      return;
    }

    // 再描画等で既にボタンがある場合は何もしない
    if (actionBar.querySelector(`[${BUTTON_ATTR}]`)) {
      decorated.add(article);
      return;
    }

    if (!getStatusUrl(article)) {
      return;
    }

    const button = makeButton(article);
    const container = document.createElement('div');

    container.style.cssText = CONTAINER_STYLE;
    container.appendChild(button);
    actionBar.appendChild(container);

    matchSiblingIcon(actionBar, button);
    decorated.add(article);
  }

  function scan() {
    document.querySelectorAll(ARTICLE_SELECTOR).forEach(decorateArticle);
  }

  // XはSPA + virtualized timelineなのでMutationObserverでrAFにまとめて再走査する
  let frameId = null;

  const observer = new MutationObserver(() => {
    if (frameId !== null) {
      return;
    }

    frameId = requestAnimationFrame(() => {
      frameId = null;
      scan();
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // bfcacheで復元され得るページ(persisted)では止めない
  window.addEventListener('pagehide', event => {
    if (event.persisted) {
      return;
    }

    observer.disconnect();

    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  });

  scan();

  console.info(`${LOG_PREFIX} ready`);
})();
