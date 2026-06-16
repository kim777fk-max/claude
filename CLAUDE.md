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

## スクリプト一覧
| やりたいこと | コマンド |
|---|---|
| カット / トリミング | `scripts/cut.sh INPUT START END [OUT]`（END は `+10` で「10秒間」） |
| 結合 / つなぐ | `scripts/concat.sh OUT IN1 IN2 [IN3...]` |
| テロップ / 字幕 | `scripts/telop.sh INPUT "文字" [OUT] [START] [END]` |
| BGM 追加 | `scripts/music.sh INPUT MUSIC [OUT]`（`MODE=replace` で差し替え） |

詳細な引数・環境変数は各スクリプト冒頭のコメント、または `README.md` 参照。

## 進め方の指針
- 複数工程（例: カット→結合→テロップ→BGM）は中間ファイルを `media/out/` に置いて順番に処理する。
- ユーザーの指示が曖昧なとき（開始/終了秒、テロップ位置、BGM音量など）は、まず動画の長さ・解像度を `ffprobe` で確認し、妥当な既定値で進めて結果を見せる。
- 元ファイルは上書きしない。
- Adobe 系 MCP の動画ツールは限定的（自動ハイライト `video_create_quick_cut`、リサイズ `video_resize`、音声分離 `media_enhance_speech`、要約 `media_summarize` のみ）。任意位置のカット/結合/テロップ/BGM は上記スクリプト（ffmpeg）で行う。
