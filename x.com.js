(function() {
    'use strict';
    window.ClipperHandlers = window.ClipperHandlers || {};

    window.ClipperHandlers['x.com'] = async (doc) => {
        // 要素抽出
        const extracted = await extract(doc);
        const decorated = decorate(extracted);
        const elems = {
            tweet: { ...decorated.tweet, raw: extracted.tweet },
            quote: { ...decorated.quote, raw: extracted.quote },
            thread: { ...decorated.thread, raw: extracted.thread },
        };

        const userName = elems?.tweet?.raw?.name ?? "unknown";

        /** @type {import('./types.d.ts').Setting} */
        const siteSetting = {
            name: `${userName}「${elems?.tweet?.raw?.text?.slice(0,30)}」`,
            path: "Clippings/x.com"
        }

        /** @type {import('./types.d.ts').Schema} */
        const siteSchema = {
            title: siteSetting.name ?? doc.title,
            tags: ["Twitter/ref", "X/ref", "Touite/ref"],
            url: doc.URL,
            author: `@${userName}`,
            userID: `https://x.com/${userName}`,
            profile: userName,
            published: doc.querySelector(`article[tabindex="-1"][data-testid="tweet"] a[role="link"] > time`)?.dateTime?.split("T")[0] ?? "",
        };

        const body = build(elems);
        const siteMarkdown = `${body || "本文が取得できませんでした"}`;
        return { siteSetting, siteSchema, siteMarkdown };
    };



    /** HTMLから要素抽出 */
    async function extract(doc) {
        const isThread = _.hasData(doc.$(`div[data-testid="cellInnerDiv"][style^="transform: translateY(0px)"] article[data-testid="tweet"][tabindex="0"]`));
        const isArticle = _.hasData(doc.$(`article[data-testid="tweet"][tabindex="-1"] div[data-testid="twitterArticleReadView"]`));
        // tweetはtabindex[-1]を必ず参照する
        const s = {
            tweet: doc.$(`article[data-testid="tweet"][tabindex="-1"]`),
            quote: isThread ?
                doc.$(`div[data-testid="cellInnerDiv"][style^="transform: translateY(0px)"] article[data-testid="tweet"][tabindex="0"] div[tabindex="0"]`) :
                doc.$(`article[data-testid="tweet"][tabindex="-1"] div[aria-labelledby] > div[id] div[tabindex="0"]`),
            thread: isThread ?
                doc.$(`div[data-testid="cellInnerDiv"][style^="transform: translateY(0px)"] article[data-testid="tweet"][tabindex="0"]`) :
                undefined,
        };

        const articleTextMd = isArticle ? await processArticleMarkdown(s.tweet) : undefined;

        // ツイート
        const tweet = !isArticle ? {
            ...((nodes = s.tweet?.$$(`div[data-testid="User-Name"] a`) || []) => ({
                name: nodes?.at(0)?.innerText,
                id:   nodes?.at(1)?.innerText,
            }))(),
            avatar: s.tweet?.$(`div[data-testid="Tweet-User-Avatar"] img`)?.src,
            text: s.tweet?.$(`div[data-testid="tweetText"]`)?.innerText,
            image: [...s.tweet?.$$(`div[aria-labelledby] > div:not([id]) > div div[data-testid="tweetPhoto"] img`) || []]?.map(img => img.src),
            video: [...s.tweet?.$$(`div[aria-labelledby] > div:not([id]) > div div[data-testid="tweetPhoto"] video`) || []]?.map(el => el.poster),
        } : {
            ...((nodes = s.tweet?.$$(`div[data-testid="User-Name"] a`) || []) => ({
                name: nodes?.at(0)?.innerText,
                id:   nodes?.at(1)?.innerText,
            }))(),
            avatar: s.tweet?.$(`div[data-testid="Tweet-User-Avatar"] img`)?.src,
            text: articleTextMd,
            image: [...s.tweet?.$$(`div[data-testid="twitterArticleReadView"] div[data-testid="tweetPhoto"] img`) || []]?.map(img => img.src),
            video: [...s.tweet?.$$(`div[data-testid="twitterArticleReadView"] div[data-testid="tweetPhoto"] video`) || []]?.map(el => el.poster),
        };

        // 引用
        const quote = {
            ...((nodes = s.quote?.$$(`div[data-testid="User-Name"] > div`) || []) => ({
                name: nodes?.at(0)?.innerText,
                id:   nodes?.at(1)?.innerText?.split("\n")?.[0],
            }))(),
            avatar: s.quote?.$(`div[data-testid="Tweet-User-Avatar"] img`)?.src,
            text: s.quote?.$(`div[data-testid="tweetText"]`)?.innerText,
            image: [...s.quote?.$$(`div div[data-testid="tweetPhoto"] img`) || []]?.map(img => img.src),
            video: [...s.quote?.$$(`div div[data-testid="tweetPhoto"] video`) || []]?.map(el => el.poster),
        };

        // ツイートに対して直線的な回答
        const thread = isThread ? {
            ...((nodes = s.thread?.$$(`div[data-testid="User-Name"] a`) || []) => ({
                name: nodes?.at(0)?.innerText,
                id:   nodes?.at(1)?.innerText,
            }))(),
            avatar: s.thread?.$(`div[data-testid="Tweet-User-Avatar"] img`)?.src,
            text: s.thread?.$(`div[data-testid="tweetText"]`)?.innerText,
            image: [...s.thread?.$$(`div[aria-labelledby] > div:not([id]) > div div[data-testid="tweetPhoto"] img`) || []]?.map(img => img?.src),
            video: [...s.thread?.$$(`div[aria-labelledby] > div:not([id]) > div div[data-testid="tweetPhoto"] video`) || []]?.map(el => el?.poster),
        } : {};

        return {tweet, quote, thread};
    }

    /** HTML要素の加工・整形。md形式への変換 */
    function decorate({tweet: t, quote: q, thread: th}) {
        const tweet_pure = {
            name:   t.name?.replace(/\n+/g,""),
            id:     t.id?.replace(/\n+/g,""),
            avatar: t.avatar?.replace(/\n+/g,"")?.replace(/(\(https.+)_.+?(\..+\))/,"$1_normal$2"),
            text:   t.text?.replace(/<img alt="(.*?)">/g,"$1")?.replace(/^/gm, "> "),
            image:  t.image?.map(x => deco_img(x))?.join("\n")?.replace(/^/gm, "> "),
            video:  t.video?.map(x => deco_img(x))?.join("\n")?.replace(/^/gm, "> "),
        };
        const quote_pure = {
            name:   q.name?.replace(/\n+/g,""),
            id:     q.id?.replace(/\n+/g,""),
            avatar: q.avatar?.replace(/\n+/g,"")?.replace(/(\(https.+)_.+?(\..+\))/,"$1_normal$2"),
            text:   q.text?.replace(/<img alt="(.*?)">/g,"$1")?.replace(/^/gm, ">> "),
            image:  q.image?.map(x => deco_img(x))?.join("\n")?.replace(/^/gm, ">> "),
            video:  q.video?.map(x => deco_img(x))?.join("\n")?.replace(/^/gm, ">> "),
        };
        const thread_pure = _.hasData(th) ? {
            name:   th.name?.replace(/\n+/g,""),
            id:     th.id?.replace(/\n+/g,""),
            avatar: th.avatar?.replace(/\n+/g,"")?.replace(/(\(https.+)_.+?(\..+\))/,"$1_normal$2"),
            text:   th.text?.replace(/<img alt="(.*?)">/g,"$1")?.replace(/^/gm, "> "),
            image:  th.image?.map(x => deco_img(x))?.join("\n")?.replace(/^/gm, "> "),
            video:  th.video?.map(x => deco_img(x))?.join("\n")?.replace(/^/gm, "> "),
        } : {};
        const tweet = {
            ...tweet_pure,
            avatar:`![](${tweet_pure.avatar})` ?? undefined
        };
        const quote = {
            ...quote_pure,
            avatar:`![](${quote_pure.avatar})` ?? undefined
        };
        const thread = _.hasData(thread_pure) ? {
            ...thread_pure,
            avatar:`![](${thread_pure.avatar})` ?? undefined
        } : {};
        return {tweet, quote, thread, };
    }

    function deco_img(str) {
        if (_.isEmpty(str)) return;
        
        const large_img = str?.replace(/(name=)[^&?]+/gm,`$1large`);
        const linked = `![](${large_img})`;
        return linked;
    }

    /**
     * 新設：Long Article専用のMarkdown変換・浄化処理
     * @param {Element} tweetNode ツイートのルートノード
     * @returns {Promise<string>} 変換済みのMarkdown文字列
     */
    async function processArticleMarkdown(tweetNode) {
        if (!tweetNode) return "";

        const titleNode = tweetNode.$(`div[data-testid="twitter-article-title"]`);
        const bodyNode = tweetNode.$(`div[data-testid="twitterArticleRichTextView"]`);

        if (!bodyNode) return "";

        // ① 画面に表示されている状態で太字を判定
        bodyNode.$$('span').forEach(span => {
            const style = window.getComputedStyle(span);
            if (style.fontWeight === '700' || style.fontWeight === 'bold') {
                span.dataset.bold = "true";
            }
        });

        // ② 安全にクローン＆絶対パス化
        const clone = _.toAbs(bodyNode);

        // ③ 意味論的復元（span -> strong, img -> text）
        clone.$$('span[data-bold="true"]').forEach(span => {
            const strong = document.createElement('strong');
            strong.innerHTML = span.innerHTML;
            span.parentNode.replaceChild(strong, span);
        });
        clone.$$('img[src*="twimg.com/emoji"]').forEach(img => {
            const emojiText = document.createTextNode(img.alt || "");
            img.parentNode.replaceChild(emojiText, img);
        });

        // ④ Markdownへ変換
        const mdContent = await _.convertMarkdown(clone);
        return ` **${titleNode?.innerText || ""}**\n\n${mdContent}`;
    }

    /** md生成 */
    function build({tweet, quote, thread}){
        const url = document.URL;
        const flg = {
            hasThread: _.hasData(thread?.raw?.id),
            hasQuote: _.hasData(quote?.raw?.id),
        }
        const template = flg.hasThread ? threadTemplate : tweetTemplate;
        return Mustache.render(template, {tweet, quote, thread, url, flg});
    }

    const tweetTemplate = `# Post
> [!Post]
> | {{{tweet.avatar}}} |{{tweet.name}} <br> {{tweet.id}} |
> | --- | --- |
{{{tweet.text}}}
{{{tweet.image}}}
{{{tweet.video}}}
{{#flg.hasQuote}}
>> [!quote]
>> | {{{quote.avatar}}} |{{quote.name}} <br> {{quote.id}} |
>> | --- | --- |
{{{quote.text}}}
{{{quote.image}}}
{{{quote.video}}}
{{/flg.hasQuote}}

# Embed
![]({{{url}}})
`;

    const threadTemplate = `# Post
> [!Post]
> | {{{tweet.avatar}}} |{{tweet.name}} <br> {{tweet.id}} |
> | --- | --- |
{{{tweet.text}}}
{{{tweet.image}}}
{{{tweet.video}}}
# Thread
> [!Thread]
> | {{{thread.avatar}}} |{{thread.name}} <br> {{thread.id}} |
> | --- | --- |
{{{thread.text}}}
{{{thread.image}}}
{{{thread.video}}}
{{#flg.hasQuote}}
>> [!quote]
>> | {{{quote.avatar}}} |{{quote.name}} <br> {{quote.id}} |
>> | --- | --- |
{{{quote.text}}}
{{{quote.image}}}
{{{quote.video}}}
{{/flg.hasQuote}}

# Embed
![]({{{url}}})
`;
})();

