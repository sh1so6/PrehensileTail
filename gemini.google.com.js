(function() {
    window.ClipperHandlers = window.ClipperHandlers || {};

    window.ClipperHandlers['gemini.google.com'] = async (doc) => {
        // 先にセレクターを用意しておく
        const s = {
            scroller: `div[class="chat-history-scroll-container"] > infinite-scroller`,
            title:    `span[data-test-id="conversation-title"]`,
            chat: {
                _:     `div[class^="conversation-container message"]`,
                user:  `user-query div[class^="query-text"]`,
                model: `model-response message-content`,
            }
        }

        /** @type {import('./types').Setting} */
        const siteSetting = {
            name: doc.$(s.title).innerText,
        }

        /** @type {import('./types').Schema} */
        const siteSchema = {
            title: siteSetting.name,
            id:    (new URL(doc.URL).pathname.split('/').pop())
        };

        const elem = {
            scroller: doc.$(s.scroller)
        }

        const count = {
            unchanged: 0,
            preScrollTop: -1,
            chatIds: new Set()
        }

        const result = {
            chats: []
        };

        while (true) {
            const resultBuffer = [];
            const chats = Object.fromEntries($$(s.chat._)?.map(x => [x.id, x]));
            
            for (const id of Object.keys(chats)) {
                if (count.chatIds.has(id)) {
                    break;
                }

                resultBuffer.push(id);
                count.chatIds.add(id); //処理完了のためリストに追加
            }
            if (result.chats.length > 0) {
                result.chats = resultBuffer.concat(result.chats);
            }
            else {
                result.chats = resultBuffer;
            }

            // スクロール実施で要素読み込みをトリガーする
            elem.scroller.scrollBy(0, -1500);
            await _.sleep(1000);

            // 最上部までスクロールされたかをチェックする
            if (elem.scroller.scrollTop === 0 || elem.scroller.scrollTop === count.preScrollTop) {
                count.unchanged++;
                if (count.unchanged >= 3) { // スクロールを3回実施して変化なければ最上部とみなす
                    break;
                }
            }
            else {
                count.unchanged = 0;
            }
            count.preScrollTop = elem.scroller.scrollTop;

        }
        console.dir(result.chats);
        // 最上位までスクロールするループ
        // 要素抽出を行いmdに蓄える
        
        const siteMarkdown = "await _.convertMarkdown(clone);";

        return { siteSetting, siteSchema, siteMarkdown };
    };
})();