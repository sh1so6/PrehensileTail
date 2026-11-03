# SourceCapsule → Custom Markdown

1. `node build-standalone.cjs` を実行し、単一ファイル版を `dist/` に生成する（miniserve不要。初回は `lib/bundle.js` のビルドが必要）。
2. `dist/sourcecapsule-md.user.js` の内容をTampermonkeyに貼り付けてインストールする。更新時は再ビルドして貼り直す。
3. 単独でインストールしたSourceCapsuleは無効にする。本スクリプトの `@require` が元コードをそのまま実行する。本家の投稿・フローティングボタンはラッパーのCSSで隠し、クリックも遮断する（本家のボタン生成処理自体は継続する）。
4. 各投稿の「保存」を押すと、その投稿をVaultの `Clippings/x.com` へ送る（Vault IDは初回に入力して保存。変更はメニューの「ObsidianのVault IDを設定」）。タイムライン・返信にも対応し、追加された投稿にもボタンを付ける。記事プレビューは個別ページで開いてから、Tampermonkeyメニューの「現在の投稿・記事をObsidianへ送る」を使う。

Advanced URIプラグインが必要。`mode=new&clipboard=true` を使い、クリップボードへのコピー完了後に開く。ファイル名はタイトルのみ（投稿IDなし）。アイコンはX標準の小さい _normal 版アイコンURLを使用する。更新時は追加された `GM_setClipboard` 権限を許可する。通常のファイル保存はメニューの「現在の投稿・記事を.mdでダウンロード」から利用できる。

保存形式は `formatMarkdown(model)` と `renderBlocks(blocks)` で変更する。見本に合わせたYAML＋`# Post` の `[!Post]`＋入れ子の `[!quote]`＋`# Embed` を出力する。投稿タイトルは表示名＋本文先頭30文字。`author` は見本同様に表示名、`userID` は実際のアカウントIDから作ったプロフィールURL。YAMLの文字列・配列はJSON表記で、Obsidianで同じ値として読める。

`feature`・`thumbnail` は出力しない。アイコン・画像・動画は元のHTTP(S) URLを参照し、Base64化も画像ファイル保存もしない。画像を見るにはネット接続が必要。省略された本文や取得不能の引用は注記を残す。

元ファイルは変更しない。先に `lib/sourcecapsule-module.js` がサンドボックス内に `module` を定義し、元コードのテスト用 `module.exports` から抽出関数を取得する。すでに別サンドボックスで起動している単独版の関数を呼ぶ方式ではない。テスト用APIへの依存なので、元コードはv1.5.2のコミットに固定してある。

指定した投稿・記事に加え、引用元と投稿の直接の返信先を補完する。「Copy Markdown」と共通の本家の取得・変換・マージ関数を利用する。非公開の引用取得関数に相当する部分は、同じsyndication APIをラッパーから呼び、本家の公開変換関数に渡す。返信先は `[!quote] 返信先` と表示する。各引用には元の投稿へのリンクも付く。取得中はボタンを無効化し、追加取得に失敗した場合は取得済み内容と注記を保存する。

元の `runExport` 全体を呼ぶ方式ではないため、自動スクロール・動画や画像のオフライン保存・完全性確認ダイアログは実行しない。syndicationが返さない長文は本家の受信済みデータによる復元に依存する。返信先取得は常に有効で、本家の設定メニューとは独立している。

検証: `node sourcecapsule-md.test.cjs <元スクリプトのパス>`。PlaywrightとEdgeを使用し、実DOMでHTML変換・引用の入れ子・画像URL・YAML・保存を確認する。X実ページでの抽出はこのテストの対象外。

