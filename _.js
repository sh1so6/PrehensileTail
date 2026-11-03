// 共通ヘルパー。他のハンドラ／entrypoint から `_` として参照される。
const _ = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

  // "www." を除いたドメイン名。URLとして解釈できなければそのまま返す
  toDomain: (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  },

  // DOM → Markdown。Readability → unified → 後処理 → Prettier の順
  async convertMarkdown(node) {
    try {
      const htmlContent = this.doReadability(node);
      let mdString = await this.doUnified(htmlContent);
      mdString = this.doCleansing(mdString);
      return await this.doPrettier(mdString);
    } catch (e) {
      console.error('md変換パイプラインエラー', e);
      return '> [!error] 変換エラー\n> ' + e.message;
    }
  },

  doReadability(node) {
    const { Readability } = window.MyClipperLibs;
    try {
      const article = new Readability(node).parse();
      return article?.content || node.innerHTML;
    } catch (e) {
      console.error('Error! doReadability', e);
      return node.innerHTML;
    }
  },

  async doUnified(htmlContent) {
    const { unified, rehypeParse, rehypeRemark, remarkStringify, remarkGfm } = window.MyClipperLibs;
    try {
      const file = await unified()
        .use(rehypeParse, { fragment: true })
        .use(rehypeRemark)
        .use(remarkGfm)
        .use(remarkStringify, { bullet: '-', emphasis: '*', listItemIndent: 'one' })
        .process(htmlContent);
      return String(file);
    } catch (e) {
      console.error('Error! doUnified', e);
      return htmlContent;
    }
  },

  // 行末の `\` 改行と数値文字参照を元の文字に戻す
  doCleansing(str) {
    return str
      .replace(/\\\n/g, '\n')
      .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));
  },

  async doPrettier(mdString) {
    const { prettier, prettierMarkdown } = window.MyClipperLibs;
    try {
      return await prettier.format(mdString, {
        parser: 'markdown',
        plugins: [prettierMarkdown],
        proseWrap: 'preserve',
      });
    } catch (e) {
      console.error('Error! doPrettier', e);
      return mdString;
    }
  },
};

window._ = window._ || {};
Object.assign(window._, _);
