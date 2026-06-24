# 動画編集ワークフロー (Claude Code 向けメモ)

このリポジトリは「スマホから Claude Code に動画を渡して編集する」ためのツール集です。
ローカル Mac でやっていた **カット / トリミング・結合・テロップ・BGM追加** を ffmpeg で行います。

## 作業を始める前に必ず実行
Web セッションのコンテナは毎回新しく作られ、ffmpeg は入っていません。動画作業の前に必ず:

```bash
bash scripts/setup.sh   # ffmpeg と日本語フォントを入れる（導入済みなら即終了）
```

## 入出力の場所
- 入力動画・音楽: `media/in/`（ユーザーが添付したファイルはここへ移動してから処理）
- 出力: `media/out/`
- 完成ファイルは `SendUserFile` でユーザーに送り返す。

## 大きいファイル / チャット添付の上限を超える場合（Cloudinary 経由）
スマホ動画はチャット添付の上限を超えやすい。その場合は Cloudinary MCP を使う:
- **入力**: 編集スクリプトは http(s) URL を直接受け取れる（ffmpeg がストリーム取得）。
  例: `scripts/cut.sh "https://res.cloudinary.com/<cloud>/video/upload/.../in.mp4" 5 +10`
  Cloudinary 上の動画は `list-videos` / `search-assets` で URL を取得できる。
- **出力**: `upload-asset` MCP ツールはリモート実行のためローカルパスを読めない。
  `scripts/cloud.sh datauri media/out/result.mp4` で base64 データURIを作り、それを
  `upload-asset` の `file` に渡す（public_id/asset_folder を指定）。戻り値の `secure_url` を
  ユーザーに渡す。データURIは約47MBまで。超える場合は解像度/ビットレートを下げてから。

## スクリプト一覧
| やりたいこと | コマンド |
|---|---|
| カット / トリミング | `scripts/cut.sh INPUT START END [OUT]`（END は `+10` で「10秒間」） |
| 結合 / つなぐ | `scripts/concat.sh OUT IN1 IN2 [IN3...]` |
| テロップ / 字幕 | `scripts/telop.sh INPUT "文字" [OUT] [START] [END]` |
| BGM 追加（ffmpeg） | `scripts/music.sh INPUT MUSIC [OUT]`（`MODE=replace` で差し替え） |
| Cloudinaryへアップ（署名・上限なし） | `scripts/upload.sh FILE` → `secure_url` を出力 |
| BGM タグ→URL（マニフェスト引き、無ければ合成） | `scripts/bgm-pick.sh TAG [DUR]` |
| SE タグ→URL（マニフェスト引き、無ければ空） | `scripts/se-pick.sh TAG` |
| Whisper 単語タイミング JSON | `scripts/whisper.sh INPUT OUT_JSON [LANG]` |
| 無音検出→ジャンプカット keep ranges | `scripts/jumpcut.sh INPUT OUT_JSON [THDB] [MIN_SEC]` |
| Remotion で本格レンダ→Cloudinary upload | `scripts/shorts.sh OUT PROPS_JSON` |
| BGM 合成（フォールバック） | `scripts/bgm-synth.sh OUT [DUR]` |
| Remotion 用 setup（node + chromium + whisper） | `scripts/setup-remotion.sh` |

詳細な引数・環境変数は各スクリプト冒頭のコメント、または `README.md` 参照。

## メインの使い方：スマホから貼り付け（2 つのスキルに分岐）
ユーザーの主動線は「**アップローダーアプリでアップ → 『Claude用にコピー』→ Claude アプリに貼り付け**」。
貼り付け本文の **キーワードで自動分岐** する:

- **`mobile-shorts-edit`**（Remotion 経由・装飾あり）を使うキーワード:
  「ショート / Shorts / リール / Reel / Reels / YouTube / YT長 / Vlog / 自動字幕 / カラオケ / OP / ED / オープニング / エンディング / タイトルカード / BGMライブラリ / 効果音 / SE / Bロール / ジャンプカット / Remotion / リモーション」
- 上記が無く、単に「つなぐ / 切る / テロップ / BGM 足す」程度なら **`mobile-video-edit`**（ffmpeg のみ・軽量）。

### `mobile-video-edit`（軽量・X 共有向け）
1. `bash scripts/setup.sh`（ffmpeg 用意）
2. URL を順番に読み、指示に応じて `cut/concat/telop/music` を実行（→ `media/out/`）
3. `URL=$(scripts/upload.sh media/out/final.mp4)` でアップ
4. **写真に保存できるタップリンク**を返す:
   `https://kim777fk-max.github.io/claude/save.html?u=<URLエンコードした secure_url>`
   返信はタップできる Markdown リンクにする（コピペ不要）。

### `mobile-shorts-edit`（Remotion 経由・装飾あり）
1. `bash scripts/setup.sh && bash scripts/setup-remotion.sh`（初回 2〜5 分かかる旨をユーザーに伝える）
2. 貼り付けから URL・出力フォーマット・装飾意図（自動字幕/BGMタグ/SE/OP/ED/ジャンプカット）を抽出
3. 補助スクリプトでシンボル → 実値解決:
   - `scripts/whisper.sh URL media/out/caption.json ja` → カラオケ字幕
   - `scripts/jumpcut.sh URL media/out/cuts.json` → 無音カット用 keep ranges
   - `scripts/bgm-pick.sh "<tag>" <duration>` → BGM URL（ヒット無しは合成パッド）
   - `scripts/se-pick.sh "<tag>"` → SE URL（ヒット無しはスキップ）
4. `media/out/props.json` を Write で組み立てる（`remotion/src/types.ts` の `ShortsProps` / `YouTubeLongProps` を参照）
5. `scripts/shorts.sh media/out/final.mp4 media/out/props.json` で Remotion レンダ → Cloudinary upload → secure_url を返却
6. 写真保存リンク化は `mobile-video-edit` と共通

## 進め方の指針
- 複数工程（例: カット→結合→テロップ→BGM）は中間ファイルを `media/out/` に置いて順番に処理する。
- ユーザーの指示が曖昧なとき（開始/終了秒、テロップ位置、BGM音量など）は、まず動画の長さ・解像度を `ffprobe` で確認し、妥当な既定値で進めて結果を見せる。
- 元ファイルは上書きしない。
- Adobe 系 MCP の動画ツールは限定的（自動ハイライト `video_create_quick_cut`、リサイズ `video_resize`、音声分離 `media_enhance_speech`、要約 `media_summarize` のみ）。任意位置のカット/結合/テロップ/BGM は上記スクリプト（ffmpeg）で行う。
