# 動画編集ワークフロー (Claude Code 向けメモ)

このリポジトリは「スマホから Claude Code に動画を渡して編集する」ためのツール集です。
ローカル Mac でやっていた **カット / トリミング・結合・テロップ・BGM追加** を ffmpeg で行います。

## 作業を始める前に必ず実行
Web セッションのコンテナは毎回新しく作られ、ffmpeg は入っていません。動画作業の前に必ず:

```bash
bash scripts/setup.sh   # ffmpeg・日本語フォント・fluidsynth・mido/numpy（導入済みなら即終了）
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
| カット / トリミング | `scripts/cut.sh INPUT START END [OUT]`（END は `+10` で「10秒間」。4K→1080p自動縮小） |
| 結合 / つなぐ | `scripts/concat.sh OUT IN1 IN2 [IN3...]`（先頭クリップの向き基準・長辺1920に自動縮小） |
| 縦型ショート化 9:16 | `scripts/vertical.sh INPUT [OUT] [START] [DURATION]`（ぼかし背景フィル） |
| 写真→クリップ | `scripts/imgclip.sh IMAGE [OUT] [SECONDS]`（縦型は `SIZE=1080x1920`） |
| テロップ / 字幕 | `scripts/telop.sh INPUT "文字" [OUT] [START] [END]` |
| BGM 追加 | `scripts/music.sh INPUT MUSIC [OUT]`（`MODE=replace` で差し替え。曲が短ければ自動ループ） |
| 納品（圧縮→アップ→保存リンク） | `scripts/deliver.sh FILE` → `URL=`/`SAVE=`/`MD=` を出力（100MB超は自動圧縮） |
| Cloudinaryへアップのみ | `scripts/upload.sh FILE` → `secure_url` を出力（**動画1本100MBまで**） |

### BGM を自作する（音源URLが無いとき・全部著作権フリー）
| 方法 | コマンド |
|---|---|
| クラシックMIDI→好きな音色 | `python3 scripts/midi_arrange.py in.mid out.mid piano`（organ/harpsichord/strings/aria/layers/metal/prog:10=オルゴール）→ `scripts/sf_render.sh media/in/fluidr3.sf2 out.mid bgm.m4a med`（サウンドフォント自動DL） |
| 感情込め（強弱・rit付与） | `python3 scripts/midi_express.py in.mid out.mid 0.6` |
| ファミコン8bit音源 | `python3 scripts/midi_render_synth.py in.mid out.wav chiptune 999` |
| オルゴール自作曲 | `python3 scripts/musicbox_gen.py out.wav campfire 60` |
| RPGバトル風自作曲 | `python3 scripts/battle_bgm.py out.wav 40` |

フリーMIDIは `https://www.flutetunes.com/tunes/<slug>.mid` が直リンク（例: schubert-ave-maria,
pachelbel-canon-in-d-major, bach-air-on-the-g-string, greensleeves, joplin-the-entertainer）。
歌入りは Sinsy（無料API・日/英/中）: 歌詞つきMusicXMLを `POST https://sinsy.sp.nitech.ac.jp/api/synthesize` へ。

詳細な引数・環境変数は各スクリプト冒頭のコメント、または `README.md` 参照。

## メインの使い方：スマホから貼り付け（スキル `mobile-video-edit`）
ユーザーの主動線は「**アップローダーアプリでアップ → 『Claude用にコピー』→ Claude アプリに貼り付け**」。
貼り付け（`Cloudinary の動画を編集してください…URL…やりたいこと…`）を受けたら **スキル `mobile-video-edit`** の手順で:
1. `bash scripts/setup.sh`（ツール用意）
2. URL を順番に読み、指示に応じて `cut/concat/vertical/imgclip/telop/music` を実行（→ `media/out/`）
   BGM の音源が無ければ「BGM を自作する」の表から生成する。
3. `scripts/deliver.sh media/out/final.mp4` で圧縮チェック→アップ→保存リンクまで一括。
4. 出力された `MD=` の行（📥写真に保存 ／ ▶再生）をそのまま返信に使う（コピペ不要）。

## 進め方の指針
- 複数工程（例: カット→結合→テロップ→BGM）は中間ファイルを `media/out/` に置いて順番に処理する。
- ユーザーの指示が曖昧なとき（開始/終了秒、テロップ位置、BGM音量など）は、まず動画の長さ・解像度を `ffprobe` で確認し、妥当な既定値で進めて結果を見せる。
- 元ファイルは上書きしない。
- 4K複数本の結合や長尺の再エンコードは Bash の2分制限を超えやすい → `run_in_background` で実行する。
- Adobe 系 MCP の動画ツールは限定的（自動ハイライト `video_create_quick_cut`、リサイズ `video_resize`、音声分離 `media_enhance_speech`、要約 `media_summarize` のみ）。任意位置のカット/結合/テロップ/BGM は上記スクリプト（ffmpeg）で行う。
