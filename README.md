# PrehensileTail 🐒

Web ページ（X など）を Markdown にして mdrop（ローカルの保存サーバー）へ送る Tampermonkey ユーザースクリプト集。

## インストール

GitHub の raw URL を開くと Tampermonkey がインストール画面を出す。`@updateURL` が設定されているので、`@version` が上がれば自動更新される。

| スクリプト | インストールURL | 内容 |
| --- | --- | --- |
| WebClipper | https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/loader.user.js | 任意のページを Alt+Shift+X / 左端ボタンで保存 |
| SourceCapsule → Custom Markdown | https://raw.githubusercontent.com/sh1so6/PrehensileTail/main/sourcecapsule-md.user.js | [SourceCapsule](https://github.com/wolfgang-aura/SourceCapsule) を使って X の投稿を独自 Markdown で保存（詳細は `sourcecapsule-md.md`） |

- 初回に mdrop のトークンを入力する。Tampermonkey のストレージに保存され、リポジトリには含まれない。
- 保存は mdrop（`127.0.0.1:18081`）経由のみ。起動していない場合はエラーを表示する。
- 本家 SourceCapsule 単体版は無効にすること。

## 構成

```
loader.user.js / sourcecapsule-md.user.js   インストール対象（ヘッダーの @require で下記を読み込む）
core/      helpers.js（共通ヘルパー）, entrypoint.js（ボタン・ショートカット・保存フロー）
handlers/  サイト別ハンドラ（default / gemini.google.com）と型定義
lib/       bundle.js（Readability・unified・prettier の esbuild 出力）, mdrop-client.js, sourcecapsule-module.js
test/      テスト
scripts/   bump-version.cjs
```

## 開発

`@require` は GitHub の raw（`main`）を読む。Tampermonkey は **`@version` が変わったときだけ** `@require` を取り直すため、自前の `@require` には `?v=<@version>` を付けてキャッシュを無効化している。モジュールを変更したら、それを読むスクリプトのバージョンを上げる:

```sh
node scripts/bump-version.cjs loader.user.js 2.3.1   # @version と ?v= を同時に更新
```

`node test/headers.test.cjs` が、`@require` の指すファイルの存在と `?v=` と `@version` の一致を検査する。push 後、raw は最大5分ほどキャッシュされる。

`lib/bundle.js` は依存ライブラリを変えたときだけ再生成してコミットする（約1MB）:

```sh
cd lib && pnpm install && pnpm build
```

### テスト

```sh
node test/entrypoint.test.cjs
node test/mdrop-client.test.cjs
node test/helpers.test.cjs
node test/headers.test.cjs
NODE_PATH=<playwright> node test/sourcecapsule-md.test.cjs <sourcecapsule.user.js のパス>
```

### SourceCapsule 本家の追従

`sourcecapsule-md.user.js` は本家の `module.exports`（テスト用API）に依存するため、`@require` はコミットSHAで固定している。

1. 本家 main の最新SHAを取得し、`@require` のSHAを差し替える。
2. 新しい `sourcecapsule.user.js` を保存し、`test/sourcecapsule-md.test.cjs` が PASS することを確認する。
3. `node scripts/bump-version.cjs sourcecapsule-md.user.js <新バージョン>` で版を上げる。

現在の固定先: v1.6.15（`3738b57`）。
