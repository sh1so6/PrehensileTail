(function () {
  window.ClipperHandlers = window.ClipperHandlers || {};

  // 作成途中: 会話を最上部までスクロールして発言IDを集めるところまで。Markdown 化は未実装
  window.ClipperHandlers['gemini.google.com'] = async (doc) => {
    const selectors = {
      scroller: 'div[class="chat-history-scroll-container"] > infinite-scroller',
      title: 'span[data-test-id="conversation-title"]',
      chat: {
        container: 'div[class^="conversation-container message"]',
        user: 'user-query div[class^="query-text"]',
        model: 'model-response message-content',
      },
    };

    /** @type {import('./types.d.ts').Setting} */
    const siteSetting = {
      name: doc.querySelector(selectors.title).innerText,
    };

    /** @type {import('./types.d.ts').Schema} */
    const siteSchema = {
      title: siteSetting.name,
      id: new URL(doc.URL).pathname.split('/').pop(),
    };

    const scroller = doc.querySelector(selectors.scroller);
    const seenIds = new Set();
    let chatIds = [];
    let unchanged = 0;
    let preScrollTop = -1;

    // 最上部までスクロールしながら、未取得の発言IDを先頭側へ蓄える
    while (true) {
      const ids = new Set(Array.from(doc.querySelectorAll(selectors.chat.container), (el) => el.id));
      const newIds = [];
      for (const id of ids) {
        if (seenIds.has(id)) break;
        newIds.push(id);
        seenIds.add(id);
      }
      chatIds = newIds.concat(chatIds);

      // スクロールして要素の読み込みをトリガーする
      scroller.scrollBy(0, -1500);
      await _.sleep(1000);

      // 3回続けて位置が変わらなければ最上部とみなす
      if (scroller.scrollTop === 0 || scroller.scrollTop === preScrollTop) {
        unchanged++;
        if (unchanged >= 3) break;
      } else {
        unchanged = 0;
      }
      preScrollTop = scroller.scrollTop;
    }
    console.dir(chatIds);

    // TODO: 要素を抽出して Markdown に変換する。現状はプレースホルダ文字列を返す
    const siteMarkdown = 'await _.convertMarkdown(clone);';

    return { siteSetting, siteSchema, siteMarkdown };
  };
})();
