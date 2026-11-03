# PrehensileTail 🐒

Web ページ（X など）を Markdown にして Obsidian へ送る Tampermonkey ユーザースクリプト集。

| ファイル | 内容 |
| --- | --- |
| `loader.user.js` | WebClipper。`_.js` `default.js` `gemini.google.com.js` `lib/*` `entrypoint.js` を束ねる |
| `sourcecapsule-md.user.js` | [SourceCapsule](https://github.com/wolfgang-aura/SourceCapsule) を使って X の投稿を独自 Markdown で保存（詳細は `sourcecapsule-md.md`） |
| `xclipper.user.js` | X の投稿に「Obsidian へ送る」ボタンを追加 |

## 使い方（単一ファイル版）

```sh
cd lib && pnpm install && pnpm build   # 初回のみ。lib/bundle.js を生成
cd .. && node build-standalone.cjs      # dist/ に単一ファイル版を生成
```

`dist/*.user.js` の内容を Tampermonkey に貼り付けてインストールする。更新時は再ビルドして貼り直す。
ローカルサーバー（miniserve 等）は不要。

- Obsidian の Vault ID は初回に入力し、Tampermonkey のストレージに保存される（リポジトリには含まれない）。
- mdrop（`127.0.0.1:18081`）が起動していれば、そちらへ保存を優先する。mdrop のトークンも初回入力。

## テスト

```sh
node entrypoint.test.cjs
node mdrop-client.test.cjs
node underscore.test.cjs
NODE_PATH=<playwright> node sourcecapsule-md.test.cjs <sourcecapsule.user.js のパス>
```

## SourceCapsule 本家の追従

`sourcecapsule-md.user.js` は本家 [SourceCapsule](https://github.com/wolfgang-aura/SourceCapsule) の `module.exports`（テスト用API）に依存するため、`@require` はコミットSHAで固定している。更新手順:

1. 本家 main の最新SHAを取得し、`@require` のSHAを差し替える。
2. 新しい `sourcecapsule.user.js` を保存し、`node sourcecapsule-md.test.cjs <そのパス>` が PASS することを確認する。
3. `node build-standalone.cjs` で再生成し、`@version` を上げて貼り直す。

現在の固定先: v1.6.15（`3738b57`）。
