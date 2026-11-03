const _ = {
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    isEmpty: (v) => 
        v == null || 
        (typeof v === 'string' && v.trim().length === 0) ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'object' && v.constructor === Object && Object.keys(v).length === 0),
    hasData: (v) => !_.isEmpty(v),
    toAbs: (doc) => {
        const targetElement = doc.cloneNode(true);
        // imgとaタグを全部拾ってきて、属性を絶対パスで強制上書き！
        targetElement.querySelectorAll('img, a').forEach(el => {
            if (el.tagName === 'IMG' && el.src) {
                el.setAttribute('src', el.src);
            }
            if (el.tagName === 'A' && el.href) {
                el.setAttribute('href', el.href);
            }
        });
        return targetElement;
    },
    toDomain: (url) => {
        try {
            const hostname = new URL(url).hostname;
            // シンプルに "www." を消す場合
            const domain = hostname.replace(/^www\./, '');
            return domain;
        }
        catch {
            return url;
        }
    },
    async convertMarkdown (node) {
        try {
            const htmlContent = this.doReadability(node);
            let mdString = await this.doUnified(htmlContent);
            mdString = this.doCleansing(mdString);
            
            // 3. Prettier
            return await this.doPrettier(mdString);
        } catch (e) {
            console.error("md変換パイプラインエラー", e);
            return "> [!error] 変換エラー\n> " + e.message;
        }
    },
    doReadability (node) {
        const { Readability } = window.MyClipperLibs;

        try {
            // 1. Readability
            const reader = new Readability(node);
            const article = reader.parse();
            
            return article?.content || node.innerHTML;
        }
        catch (e){
            console.error('Error! doReadability', e);
            return node.innerHTML;
        }
    },
    async doUnified (htmlContent) {
        const { unified, rehypeParse, rehypeRemark, remarkStringify, remarkGfm } = window.MyClipperLibs;
        // 2. Remark (Unified)
        try {
            const file = await unified()
                .use(rehypeParse, { fragment: true })
                .use(rehypeRemark)
                .use(remarkGfm)
                .use(remarkStringify, { bullet: '-', emphasis: '*', listItemIndent: 'one' })
                .process(htmlContent);
            return String(file);
        }
        catch (e){
            console.error('Error! doUnified', e);
            return htmlContent;
        }
    },
    doCleansing (str) {
        let mdString = str;
        mdString = mdString.replace(/\\\n/g, '\n');
        mdString = mdString.replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
        mdString = mdString.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));
        return mdString;
    },
    async doPrettier (mdString) {
        const { 
            prettier, prettierMarkdown
        } = window.MyClipperLibs;
        try {
            return await prettier.format(mdString, {
                parser: "markdown",
                plugins: [prettierMarkdown],
                proseWrap: "preserve"
            });
        }
        catch (e){
            console.error('Error! doPrettier', e);
            return mdString;
        }
        
    }
};
window._ = window._ || {};
Object.assign(window._, _);

/**
 * Native object enhancement for document.$ and element.$
 */

(function() {
    // 共通のアップグレード処理
    const upgrade = (el) => {
        if (!el || el.$) return el;
        // 再帰的に $ と $$ を持たせる
        el.$ = function(s) { return upgrade(this.querySelector(s)); };
        el.$$ = function(s) { 
            return Array.from(this.querySelectorAll(s)).map(upgrade); 
        };
        el.on = function(t, cb) { this.addEventListener(t, cb); return this; };
        return el;
    };

    // Document と Element の両方のプロトタイプに $ と $$ を定義
    [Document.prototype, Element.prototype].forEach(proto => {
        proto.$ = function(s) {
            return upgrade(this.querySelector(s));
        };
        proto.$$ = function(s) {
            return Array.from(this.querySelectorAll(s)).map(upgrade);
        };
    });

    // グローバルな $ も、document.$ のショートカットとして定義
    window.$ = (s) => document.$(s);
    window.$$ = (s) => document.$$(s);
})();