(function() {
    'use strict';
    window.ClipperHandlers = window.ClipperHandlers || {};

    // 共通のMarkdown変換が非同期(Promise)になったため、ハンドラも async にします！
    window.ClipperHandlers['www.4gamer.net'] = async (doc) => {
        /** @type {import('./types.d.ts').Setting} */
        const siteSetting = {
            name: doc.title.slice(0,30),
            path: "Clippings/4gamer.net"
        };

        /** @type {import('./types.d.ts').Schema} */
        const siteSchema = {
            title: siteSetting.name,
            tags: ["4gamers"],
            url: doc.URL,
        };

        // 1. 本文エリアの特定（先輩が作った $ ショートカットが大活躍！）
        const mainTxtNode = doc.$(`div[class="container"] div[class="maintxt"]`);
        
        if (!mainTxtNode) {
            console.error("4gamer: 本文要素が見つかりませんでした");
            send(siteSetting, siteSchema, "> [!error] 本文の取得に失敗しました。");
            return;
        }

        // 2. _.toAbs を使って、DOMのクローンと絶対パス化を同時に実行！
        let clonedNode = _.toAbs(mainTxtNode);

        // 3. サイト独自の前処理（YouTubeの浄化と不要属性の削除）
        clonedNode = getYTLink(clonedNode);

        // 4. タイトル要素の取得
        const titleText = doc.$(`div[class="container"] > h1`)?.innerText || doc.title;

        // 5. 綺麗になったDOMを、最強の共通パイプライン（Remark + Prettier）へ投げる！
        let convertedMd = await _.convertMarkdown(clonedNode);

        // 6. 元の仕様通り、タイトルの文字列をMarkdownの先頭に太字で結合
        const siteMarkdown = `**${titleText}**\n\n${convertedMd}`;

        // 7. Obsidianへ転送！
        return { siteSetting, siteSchema, siteMarkdown };
    };

    /**
     * 4gamer独自の前処理（YouTubeの置換＆属性のお掃除）
     * ※ロジックは先輩の書いた完璧なコードをそのまま活かしています！
     */
    const getYTLink = (targetElement) => {
        targetElement.querySelectorAll('div[onclick*="youtube.com/watch"]').forEach(div => {
            const onclickStr = div.getAttribute('onclick');
            if (!onclickStr) return;

            // 正規表現でシングルクォートに囲まれたYouTubeのURLを抽出
            const urlMatch = onclickStr.match(/'(https:\/\/www\.youtube\.com\/watch\?v=[^']+)'/);
            
            if (urlMatch && urlMatch[1]) {
                const youtubeUrl = urlMatch[1];
                
                // 新しくクリーンな <a> タグを生成
                const cleanLink = document.createElement('a');
                cleanLink.href = youtubeUrl;
                cleanLink.textContent = youtubeUrl;
                
                // 元の汚いdiv要素を、作成した綺麗なaタグにまるごと置換！
                div.parentNode.replaceChild(cleanLink, div);
            }
        });

        // 属性のお掃除
        targetElement.querySelectorAll('*').forEach(el => {
            el.removeAttribute('onclick');
            el.removeAttribute('style');
            el.removeAttribute('data-player-id');
        });

        return targetElement;
    };
})();