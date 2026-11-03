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
NODE_PATH=<playwright> node sourcecapsule-md.test.cjs <sourcecapsule.user.js のパス>
```
