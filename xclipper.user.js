// ==UserScript==
// @name         XClipper → Obsidian One Click
// @namespace    https://x.com/
// @version      0.1.0
// @description  Add a one-click "Send to Obsidian" button to X posts via XClipper.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @updateURL   http://127.0.0.1:18080/xclipper.user.js
// @downloadURL http://127.0.0.1:18080/xclipper.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const BUTTON_ATTR = 'data-xclipper-obsidian-button';
  const decorated = new WeakSet();

  /**
   * XClipperと同じ考え方で、tweet内のstatus permalinkを取得する。
   */
  function getStatusUrl(article) {
    const time = article.querySelector('a[href*="/status/"] time');

    if (time) {
      const link = time.closest('a');
      if (link?.href) {
        return link.href;
      }
    }

    // fallback
    const links = article.querySelectorAll('a[href*="/status/"]');

    for (const link of links) {
      if (/\/status\/\d+/.test(link.href)) {
        return link.href;
      }
    }

    return null;
  }

  function normalizeStatusUrl(url) {
    try {
      const u = new URL(url, location.href);
      const match = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/);

      if (!match) {
        return null;
      }

      return `${u.origin}/${match[1]}/status/${match[2]}`;
    } catch {
      return null;
    }
  }

  /**
   * XClipperにObsidian exportを依頼する。
   *
   * permalinkページを既に表示中:
   *   CustomEventでその場実行
   *
   * timeline上:
   *   permalink + #xclipper=obsidian を新規タブで開く
   */
  function sendToObsidian(article) {
    const statusUrl = getStatusUrl(article);

    if (!statusUrl) {
      console.warn('[X → Obsidian] status URL not found');
      return;
    }

    const target = normalizeStatusUrl(statusUrl);
    const current = normalizeStatusUrl(location.href);

    // 既に対象tweetのpermalink上にいる
    if (target && current && target === current) {
      window.dispatchEvent(
        new CustomEvent('xclipper:autoextract', {
          detail: {
            action: 'obsidian',
            single: true,
          },
        })
      );

      return;
    }

    // timeline等からはXClipperのauto-extract URLを開く
    const url =
      statusUrl.split('#')[0] +
      '#xclipper=obsidian&xclipper_single=1';

    window.open(url, '_blank', 'noopener');
  }

  function buildIcon() {
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(SVG_NS, 'svg');

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    Object.assign(svg.style, {
      width: '1.25em',
      height: '1.25em',
      display: 'block',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '1.8',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    });

    // シンプルな「ノートへ送る」アイコン
    const path1 = document.createElementNS(SVG_NS, 'path');
    path1.setAttribute(
      'd',
      'M6 3.5h8l4 4V20.5H6z'
    );

    const path2 = document.createElementNS(SVG_NS, 'path');
    path2.setAttribute(
      'd',
      'M14 3.5v4h4M9 12h6M9 16h4'
    );

    svg.append(path1, path2);

    return svg;
  }

  function makeButton(article) {
    const button = document.createElement('div');

    button.setAttribute(BUTTON_ATTR, '1');
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-label', 'Send to Obsidian');

    button.title = 'Send to Obsidian via XClipper';

    button.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'cursor:pointer',
      'color:rgb(113,118,123)',
      'padding:8px',
      'border-radius:9999px',
      'transition:background-color .15s,color .15s',
      'user-select:none',
    ].join(';');

    button.appendChild(buildIcon());

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = 'rgba(124, 58, 237, .10)';
      button.style.color = 'rgb(124, 58, 237)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '';
      button.style.color =
        button.dataset.idleColor ||
        'rgb(113,118,123)';
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

  /**
   * Xのテーマや表示コンテキストに合わせる。
   * XClipper本体と同じく隣のSVGサイズ・色を参照。
   */
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

    const fill = getComputedStyle(reference).fill;
    const color = getComputedStyle(reference).color;

    const idleColor =
      fill && fill !== 'none'
        ? fill
        : color;

    if (idleColor) {
      button.dataset.idleColor = idleColor;
      button.style.color = idleColor;
    }
  }

  function decorateArticle(article) {
    if (decorated.has(article)) {
      return;
    }

    // XClipper本体と同じaction bar探索
    const actionBar =
      article.querySelector('div[role="group"][id^="id__"]') ||
      article.querySelector('div[role="group"]');

    if (!actionBar) {
      return;
    }

    if (actionBar.querySelector(`[${BUTTON_ATTR}]`)) {
      decorated.add(article);
      return;
    }

    if (!getStatusUrl(article)) {
      return;
    }

    const button = makeButton(article);

    const container = document.createElement('div');

    container.style.cssText =
      'display:flex;align-items:center;';

    container.appendChild(button);
    actionBar.appendChild(container);

    matchSiblingIcon(actionBar, button);

    decorated.add(article);
  }

  function scan() {
    document
      .querySelectorAll('article[role="article"]')
      .forEach(decorateArticle);
  }

  // XはSPA + virtualized timelineなのでMutationObserver必須
  let scheduled = false;

  const observer = new MutationObserver(() => {
    if (scheduled) {
      return;
    }

    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  scan();

  console.info('[X → Obsidian] ready');
})();