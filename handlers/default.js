(function () {
  window.ClipperHandlers = window.ClipperHandlers || {};

  // どのサイト専用ハンドラにも当たらないときの標準ハンドラ
  window.ClipperHandlers['default'] = async (doc) => {
    /** @type {import('./types.d.ts').Setting} */
    const siteSetting = {
      name: Array.from(doc.title).slice(0, 30).join(''),
    };

    /** @type {import('./types.d.ts').Schema} */
    const siteSchema = {
      title: siteSetting.name,
    };

    const siteMarkdown = await _.convertMarkdown(doc.cloneNode(true));

    return { siteSetting, siteSchema, siteMarkdown };
  };
})();
