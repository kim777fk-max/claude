# 自動編集バックエンド (`server/`)

スマホアプリの「バックエンド方式」を担うサーバーです。2つのAPIを提供します。

| エンドポイント | 役割 |
|---|---|
| `POST /api/sign` | ブラウザからの**署名アップロード**用の署名を返す（未署名プリセット不要・APIシークレットはサーバーに留まる） |
| `POST /api/edit` | `{ url, prompt }` を受け取り、**Claudeが編集プランを作成** → ffmpegで実行 → Cloudinaryへアップ → `secure_url` を返す |

`/api/edit` は親フォルダの `scripts/`（cut/concat/telop/music）を呼び出します。Claudeが出せるのは
ホワイトリスト化した操作（カット/テロップ/BGM/結合）だけで、任意コマンド実行はできません。

## セットアップ

```bash
cd server
cp .env.example .env     # 各キーを記入
npm install
npm start                # http://localhost:8787
```

必要なキー（`.env`）：
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`（Cloudinaryダッシュボード）
- `ANTHROPIC_API_KEY`（https://console.anthropic.com）
- `EDIT_PLANNER_MODEL`（既定 `claude-opus-4-8`）
- `ALLOWED_ORIGINS`（アプリを置く GitHub Pages のURL。例 `https://<user>.github.io`）

## アプリ側の設定
アプリの ⚙️ → 「バックエンドURL」にこのサーバーのURLを入力すると：
- アップロードが**署名方式**になり、未署名プリセットが不要になります
- 「⚡ 自動で編集する」ボタンが現れ、プロンプトから編集してリンクを返します

## デプロイの注意
- ffmpeg が必要です（`bash scripts/setup.sh` で導入、またはコンテナに同梱）。
- このサーバーはリポジトリ直下の `scripts/` と `media/out/` を使うので、リポジトリごとデプロイしてください。
- 公開する場合は認証/レート制限の追加を検討してください（このMVPには未実装）。
