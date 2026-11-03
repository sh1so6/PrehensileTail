(function() {
    window.ClipperHandlers = window.ClipperHandlers || {};

    window.ClipperHandlers['default'] = async (doc) => {
        /** @type {import('./types.d.ts').Setting} */
        const siteSetting = {
            name: Array.from(doc.title).slice(0, 30).join(''),
        }

        /** @type {import('./types.d.ts').Schema} */
        const siteSchema = {
            title: siteSetting.name ?? doc.title
        };
        
        const clone = doc.cloneNode(true)
        const siteMarkdown = await _.convertMarkdown(clone);

        return { siteSetting, siteSchema, siteMarkdown };
    };
})();
