(function() {
    window.ClipperHandlers = window.ClipperHandlers || {};

    window.ClipperHandlers['gemini_batch'] = async () => {
        console.log("Gemini一括エクスポートを開始します...");
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // MDダウンロード用関数
        const downloadMarkdown = (filename, content) => {
            const safeName = filename.replace(/[\\/:*?"<>|]/g, '_').trim() || "Untitled";
            const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}.md`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        };

        // 要素の一意キー用：テキストから簡易的なハッシュを生成する関数
        const generateHash = async (text) => {
            const msgBuffer = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };

        // 1. サイドバーのリンク一覧を取得
        const chatLinks = Array.from(document.querySelectorAll('a[href^="/app/"]'))
            .filter(a => a.href.match(/\/app\/[a-zA-Z0-9]+$/));

        if(chatLinks.length === 0) {
            alert("履歴が見つかりませんでした。サイドバーが開いているか確認してください。");
            return;
        }

        console.log(`合計 ${chatLinks.length} 件のチャットを処理します。`);

        // 2. 履歴を順番に巡回
        for (let i = 0; i < chatLinks.length; i++) {
            const link = chatLinks[i];
            const chatTitle = link.textContent.trim() || `Chat_${i+1}`;
            console.log(`[${i+1}/${chatLinks.length}] ${chatTitle} を処理中...`);
            
            link.click();
            await sleep(3000); // 画面遷移と初期レンダリング待機

            // スクロールコンテナの特定（※要調整: bodyではない可能性あり）
            const scrollContainer = document.querySelector('message-list')?.parentElement || document.querySelector('body');
            
            const processedIds = new Set(); // 処理済み管理用
            let chatBlocks = []; // 最終的なMDテキストを順番通りに溜める配列
            
            let previousScrollTop = -1;
            let unchangedCount = 0;

            // 3. 上スクロール＆逐次抽出ループ
            while (true) {
                // ※要調整: ユーザーとGeminiのやり取りを囲むブロック要素を特定
                const messageElements = Array.from(document.querySelectorAll('.message-content, [data-author-role], user-query, model-response'));
                
                let newlyDiscovered = []; // 今回のループで新しく見つけたMDブロック

                for (const el of messageElements) {
                    const rawText = el.textContent.trim();
                    if (!rawText) continue;
                    
                    // ID属性がなければ、テキストのハッシュをIDとして代用する堅牢な設計
                    const id = el.getAttribute('data-message-id') || await generateHash(rawText);

                    // 未処理の要素だけを狙い撃ち
                    if (!processedIds.has(id)) {
                        processedIds.add(id);
                        
                        // ロールの判定（※要調整）
                        const isUser = el.hasAttribute('data-author-role') 
                            ? el.getAttribute('data-author-role') === 'user'
                            : el.closest('.user-class') !== null;
                        const role = isUser ? 'User' : 'Gemini';

                        // 該当ブロックだけをクローンして、先輩のMD変換パイプラインへ！
                        const clone = el.cloneNode(true);
                        const mdText = await window._.convertMarkdown(clone);
                        
                        // MD文字列として一時配列に格納
                        newlyDiscovered.push(`### ${role}\n${mdText}\n\n---\n\n`);
                    }
                }

                // 【ここが時系列を保つ超重要トリック！】
                // 新しく見つけた要素（=より過去の会話）を、既存のリストの「先頭」に合体させる
                if (newlyDiscovered.length > 0) {
                    chatBlocks = newlyDiscovered.concat(chatBlocks);
                }

                // 上にスクロール
                scrollContainer.scrollBy(0, -1500); // 1500px上にスクロール
                await sleep(1500); // 新規要素の遅延読み込みを待機

                // 最上部まで到達したか判定
                // (scrollTopが0になる、または変化しなくなる)
                if (scrollContainer.scrollTop === 0 || scrollContainer.scrollTop === previousScrollTop) {
                    unchangedCount++;
                    if (unchangedCount >= 3) {
                        // 3回スクロールしても動かなければ最上部とみなして脱出
                        break;
                    }
                } else {
                    unchangedCount = 0; // スクロールできたらリセット
                }
                previousScrollTop = scrollContainer.scrollTop;
            }

            // 4. 1チャット分の処理が完了。結合してダウンロード
            const finalContent = `# ${chatTitle}\n\n${chatBlocks.join('')}`;
            downloadMarkdown(chatTitle, finalContent);

            await sleep(2000); // 次のチャットへ行く前にBot検知避けのインターバル
        }
        
        alert("すべてのエクスポートが完了しました！");
    };
})();