---
name: mobile-video-edit
description: スマホから貼り付けた動画編集依頼のうち「素早く X 共有」向けの軽量編集を処理する。アップローダーアプリの「Claude用にコピー」で貼られる『Cloudinary の動画を編集してください…ファイル/URL…やりたいこと…』形式や、Cloudinary 等の動画URL＋編集指示（カット/結合/テロップ/BGM）を受けたら、このスキルで ffmpeg 編集→Cloudinary へアップ→iPhoneの写真に保存できるリンクを返す。装飾少なめ・即出し用。
---

# スマホ動画編集ワークフロー（軽量・X共有向け）

スマホの Claude アプリに**貼り付けられた依頼**を処理し、最後に**タップで写真に保存できるリンク**を返す。

## どちらのスキルか判定（重要・最初に行う）
貼り付け本文に **次のキーワードが含まれていたら `mobile-shorts-edit` スキルを使う**（こちらは使わない）:
- 「ショート / Shorts / TikTok / リール / Reel / Reels / YouTube / YT長 / YT 長 / Vlog / vlog」
- 「字幕 / 自動字幕 / カラオケ / テロップ装飾 / オープニング / エンディング / タイトルカード」
- 「BGM ライブラリ / 効果音 / SE / Bロール / ジャンプカット / 装飾」
- 「Remotion / リモーション」

上記が無く、単なる「つなぐ / 切る / テロップ（簡易）/ BGM 足す」だけならこのスキルで処理する。

## トリガー
次のような入力を受けたら実行する:
- 「Cloudinary の動画を編集してください…ファイル…URL…やりたいこと…」（アップローダーの「Claude用にコピー」出力）
- 動画URL（複数可）＋「つなげて」「○秒切り出して」「テロップ入れて」「BGM足して」等の指示

## 手順

### 0. ffmpeg を用意（Webセッションは毎回必要）
```bash
bash scripts/setup.sh   # ffmpeg + 日本語フォント（導入済みなら即終了）
```

### 1. 入力を読み取る
- 貼り付けから **動画URLを順番どおり**に全部抜き出す（`https://res.cloudinary.com/...` など）。
- 「やりたいこと」の文から操作を判断（複数可・順番に適用）:
  - 結合 / つなぐ → concat
  - 〜秒を切り出す / トリミング → cut
  - テロップ / 字幕 / 文字 → telop
  - BGM / 音楽 → music（音源URLが要る。なければその旨を伝える）

### 2. 編集する（出力は media/out/、入力にURLを直接渡せる）
中間ファイルを使って順番に処理する。代表例:
```bash
# 結合（解像度違いも自動で揃う）
scripts/concat.sh media/out/out.mp4 "URL1" "URL2" "URL3"

# カット（START〜END。+10 で「10秒間」）
scripts/cut.sh "URL" 5 +10 media/out/out.mp4

# テロップ（日本語OK。POS=top/center/bottom、任意で START END）
POS=top scripts/telop.sh media/out/out.mp4 "オープニング" media/out/out2.mp4 0 3

# BGM（MODE=mix/replace, MUSIC_VOL=0..1, FADE=秒）
MUSIC_VOL=0.2 FADE=2 scripts/music.sh media/out/out.mp4 "MUSIC_URL" media/out/final.mp4
```
複数工程は中間ファイル（out.mp4 → out2.mp4 → final.mp4）でつなぐ。元ファイルは上書きしない。

### 3. Cloudinary へアップロード（署名取得は自動・サイズ制限なし）
```bash
URL="$(scripts/upload.sh media/out/final.mp4)"   # secure_url を返す
echo "$URL"
```

### 4. 写真に保存できるリンクを作って返す
URLエンコードして保存ページのリンクにする:
```bash
ENC="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$URL")"
echo "https://kim777fk-max.github.io/claude/save.html?u=$ENC"
```
返信は**タップできる Markdown リンク**で（コピペ不要にする）:
```
[📥 写真に保存](https://kim777fk-max.github.io/claude/save.html?u=ENC) ／ [▶ 再生](URL)
```
保存ページの「📥写真に保存」→ 共有シートの「ビデオを保存」で iPhone の写真に入り、X 投稿できる。

## メモ
- 入力に音声トラックが無いクリップが混ざっても concat は動く（無音を自動合成）。
- 出力が大きくても `scripts/upload.sh`（署名アップロード）なら上限なしで上げられる。
- 迷う指定（開始/終了秒・テロップ位置・BGM音量）は妥当な既定で進めて結果リンクを見せる。
- これは「貼り付け→編集→保存リンク」用。アプリ内「⚡自動で編集」はバックエンドが担当（こちらのスキルは不要）。
