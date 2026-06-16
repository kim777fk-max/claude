# 自動編集バックエンド (`server/`)

スマホアプリの「バックエンド方式」を担うサーバーです。2つのAPIを提供します。

| エンドポイント | 役割 |
|---|---|
| `POST /api/sign` | ブラウザからの**署名アップロード**用の署名を返す（未署名プリセット不要・APIシークレットはサーバーに留まる） |
| `POST /api/edit` | `{ url \| urls[], prompt }` を受け取り、**非同期ジョブを開始**して `{ jobId }` を即返す（長尺でもタイムアウトしない） |
| `GET /api/job/:id` | ジョブ状態を返す（`queued`/`running`/`done`/`error`）。`done` で `secure_url` を含む |

`/api/edit` は親フォルダの `scripts/`（cut/concat/telop/music）を呼び出します。Claudeが出せるのは
ホワイトリスト化した操作（カット/テロップ/BGM/結合）だけで、任意コマンド実行はできません。
ジョブはメモリ上で1件ずつ順番に処理します（単一インスタンス前提のMVP）。

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

## デプロイ

`Dockerfile`（リポジトリ直下）に ffmpeg・日本語フォント・`scripts/`・`server/` を同梱済み。
これをそのまま使えます。**デプロイ後、アプリの ⚙️「バックエンドURL」に公開URLを入れてください。**

### Docker（ローカル確認）
```bash
docker build -t video-edit-backend .
docker run --rm -p 8787:8787 --env-file server/.env video-edit-backend
# → http://localhost:8787/api/health が {"ok":true}
```

### Render（最も手軽・`render.yaml` 同梱）
1. Render → New → **Blueprint** → このリポジトリを選択（`render.yaml` を自動検出）
2. シークレット（`CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` / `ANTHROPIC_API_KEY` /
   `ALLOWED_ORIGINS`）をダッシュボードで入力
3. デプロイ後のURLをアプリの「バックエンドURL」に設定

### Fly.io
```bash
fly launch --no-deploy        # Dockerfile を検出（internal_port は 8787 に）
fly secrets set CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... ANTHROPIC_API_KEY=... \
  CLOUDINARY_CLOUD_NAME=dftjmz7l5 ALLOWED_ORIGINS=https://kim777fk-max.github.io
fly deploy
```

### Google Cloud Run
```bash
gcloud run deploy video-edit-backend --source . --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars CLOUDINARY_CLOUD_NAME=dftjmz7l5,CLOUDINARY_FOLDER=claude-edits,EDIT_PLANNER_MODEL=claude-opus-4-8,ALLOWED_ORIGINS=https://kim777fk-max.github.io
# シークレットは Secret Manager 経由を推奨:
#   --set-secrets CLOUDINARY_API_KEY=...:latest,CLOUDINARY_API_SECRET=...:latest,ANTHROPIC_API_KEY=...:latest
```
Cloud Run は `$PORT`（8080）を注入します。サーバーは `PORT` を尊重するのでそのまま動きます。

## 注意
- `ALLOWED_ORIGINS` は Pages のURL（例 `https://kim777fk-max.github.io`）を指定。`*` でも可。
- このMVPには認証/レート制限がありません。公開運用するなら追加を検討してください
  （`/api/edit` は Claude 推論＋編集を行うため、無防備だとコストがかかります）。
- 動画が長い/大きいと処理に時間がかかります。プラットフォームのリクエストタイムアウトに注意。
