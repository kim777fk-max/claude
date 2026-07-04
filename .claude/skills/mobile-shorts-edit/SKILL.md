---
name: mobile-shorts-edit
description: スマホ貼り付けの動画編集依頼のうち「ショート / Reels / YouTube 長尺 / Vlog / 装飾あり」向けの本格編集を Remotion で組み上げる。自動字幕（カラオケ風）、BGM ライブラリ、効果音、オープニング/エンディング、ジャンプカット、Bロール画像挿入に対応。最終的に Cloudinary にアップして写真保存リンクを返すのは `mobile-video-edit` と同じ。
---

# スマホ動画編集ワークフロー（Remotion・装飾あり）

ショート / Reels / YouTube 長尺 / Vlog 向けに、**Remotion でタイムラインを組んでレンダリング**してから Cloudinary にアップする。`mobile-video-edit`（ffmpeg だけの軽量版）の上位互換。

## このスキルを使うキーワード（貼り付け本文を見て判定）
以下のどれかが含まれていれば**こちら**を使う:
- 動画形式: 「ショート / Shorts / TikTok / リール / Reel / Reels / YouTube / YT長 / YT 長尺 / Vlog / vlog」
- 装飾: 「自動字幕 / カラオケ字幕 / テロップ装飾 / オープニング / エンディング / タイトルカード / OP / ED」
- 素材: 「BGM ライブラリ / BGM おすすめ / 効果音 / SE / 効果音入れ / Bロール / B-roll / 画像挿入」
- 編集手法: 「ジャンプカット / 無音カット / テンポよく / リズム編集」
- 名指し: 「Remotion / リモーション / 本格 / 高度な編集」

無ければ素直に `mobile-video-edit` 側を使う。

## 手順

### 0. 依存セットアップ（Web セッションは毎回必要・遅延実行）
ffmpeg のセットアップに加えて、Remotion + chromium + whisper を遅延導入する。
```bash
bash scripts/setup.sh           # ffmpeg + 日本語フォント
bash scripts/setup-remotion.sh  # node deps + chromium-headless + openai-whisper
```
`setup-remotion.sh` は初回 2〜5 分かかる（Chromium と Whisper モデルのダウンロード）。**実行前に「初回セットアップに数分かかります」と一言伝える**。

### 1. 貼り付けを読み取って意図を分解する
貼り付け本文から以下を抽出する:
- **動画 URL の並び順**（Cloudinary URL を上から順番に）
- **出力フォーマット**: 「ショート/リール → vertical 1080×1920」「YT 長 → 1920×1080」「Vlog → 1920×1080」が既定
- **装飾オプション**:
  - 自動字幕（カラオケ風） → `karaoke: true`
  - ジャンプカット → `jumpCut: true`
  - BGM タグ（「チル / アップビート / 感動 / Vlog / Lo-Fi」等） → `bgm.tag`
  - SE 入れて → `se: ["pop", "swoosh", ...]`（自動配置）
  - OP テキスト「【夏のVlog】」のような明示があれば → `intro.text`
  - ED「チャンネル登録」「フォローよろしく」等 → `outro.text`
  - B ロール画像 URL があれば → `bRolls`

### 2. props.json を組み立てる
Remotion 入力 props を `media/out/props.json` に書く。スキーマは `remotion/src/types.ts` の `ShortsProps` / `YouTubeLongProps`。最低限の例:

```json
{
  "format": "shorts",
  "clips": [
    { "src": "https://res.cloudinary.com/.../a.mp4" },
    { "src": "https://res.cloudinary.com/.../b.mp4" }
  ],
  "intro":  { "text": "夏のVlog", "duration": 1.5 },
  "outro":  { "text": "チャンネル登録おねがいします", "duration": 2.0 },
  "caption": { "style": "karaoke" },
  "bgm":    { "tag": "vlog", "volume": 0.15, "fadeOut": 2.5 },
  "se":     [ { "tag": "swoosh", "at": "clip-boundaries" } ],
  "jumpCut": { "thresholdDb": -32, "minSilence": 0.4 }
}
```
`Write` ツールで書くのが速い。ファイルパスは `media/out/props.json`。

### 3. 補助スクリプトでフィールドを実値に解決する
props.json の中で `"tag": "vlog"` や `"at": "clip-boundaries"` のような**シンボル**を実 URL / 実秒数に解決する:

```bash
# BGM タグ → Cloudinary URL を assets/bgm-manifest.json から選ぶ
scripts/bgm-pick.sh "vlog"            # secure_url を出力

# SE タグ → URL
scripts/se-pick.sh "swoosh"           # secure_url を出力

# 動画の音声から単語タイミング JSON を作る（カラオケ字幕用）
scripts/whisper.sh "URL_OR_FILE" media/out/caption.json   # 言語自動判定（既定 ja）

# 無音区間を検出してジャンプカット用の cuts.json を作る
scripts/jumpcut.sh "URL_OR_FILE" media/out/cuts.json -32 0.4
```

これらの結果をスキル側（あなた）で props.json にマージしてから次に進む。

### 4. Remotion でレンダリング → Cloudinary へアップロード
```bash
scripts/shorts.sh media/out/final.mp4 media/out/props.json
# 内部で: npx remotion render Shorts media/out/_render.mp4 --props=props.json
#         → ffmpeg で音声最適化 → scripts/upload.sh で Cloudinary
# 標準出力に secure_url を返す
```

### 5. 写真に保存できるリンクで返信
`mobile-video-edit` と同じ:
```bash
URL="$(scripts/shorts.sh media/out/final.mp4 media/out/props.json | tail -1)"
ENC="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$URL")"
echo "[📥 写真に保存](https://kim777fk-max.github.io/claude/save.html?u=$ENC) ／ [▶ 再生]($URL)"
```

## 利用できるフォーマット
- `format: "shorts"` → 1080×1920, 30fps, 最大 60秒（コンポジション名: `Shorts`）
- `format: "reels"`  → 1080×1920, 30fps, 最大 90秒（同じ `Shorts` コンポジションを使い `durationInFrames` だけ伸ばす）
- `format: "yt-long"` → 1920×1080, 30fps（コンポジション名: `YouTubeLong`）
- `format: "yt-square"` → 1080×1080（同上、`width=height` で投げる）

## メモ
- BGM / SE のマニフェストは `assets/bgm-manifest.json` `assets/se-manifest.json`。ユーザーが Cloudinary に追加したものをタグ付きで登録する仕組み。**マニフェストに該当タグが無い場合**は自動生成のソフトパッドにフォールバックする（`scripts/bgm-pick.sh --synth`）。
- Whisper はオフラインで動く（`whisper` python パッケージ、CPU、日本語対応）。初回モデルダウンロードは ~150MB。
- ジャンプカット閾値の既定は `-32dB / 0.4秒以上`。Vlog 喋り素材で経験的に良い値。
- 長すぎる入力（5分超）はレンダリングに時間がかかる。途中経過は `npx remotion render` の標準エラーに出る。
- 元 URL / 中間ファイルは上書きしない。最終ファイルだけ Cloudinary にアップ。
- 既存の `mobile-video-edit` は「素早く X 共有」用として残してある。両方のスキルで `scripts/upload.sh` と保存ページは共通。
