---
name: mobile-video-edit
description: スマホから貼り付けた動画編集依頼を処理する。アップローダーアプリの「Claude用にコピー」で貼られる『Cloudinary の動画を編集してください…ファイル/URL…やりたいこと…』形式や、Cloudinary 等の動画URL＋編集指示（カット/結合/テロップ/BGM/ショート化）を受けたら、このスキルで ffmpeg 編集→BGM生成→Cloudinary へアップ→iPhoneの写真に保存できるリンクを返す。
---

# スマホ動画編集ワークフロー

スマホの Claude アプリに**貼り付けられた依頼**を処理し、最後に**タップで写真に保存できるリンク**を返す。

## トリガー
次のような入力を受けたら実行する:
- 「Cloudinary の動画を編集してください…ファイル…URL…やりたいこと…」（アップローダーの「Claude用にコピー」出力）
- 動画URL（複数可）＋「つなげて」「○秒切り出して」「テロップ入れて」「BGM足して」「ショートにして」等の指示

**振り分け**: 「自動字幕/カラオケ字幕/OP/ED/効果音/Bロール/ジャンプカット/Remotion」など
装飾の濃い依頼はスキル `mobile-shorts-edit`（Remotion版）へ。単純なカット/結合/テロップ1枚/
BGM/9:16化はこのスキル（ffmpeg）が速くて確実。

## 手順

### 0. ツールを用意（Webセッションは毎回必要）
```bash
bash scripts/setup.sh   # ffmpeg + 日本語フォント + fluidsynth + mido/numpy（導入済みなら即終了）
```

### 1. 入力を読み取る
- 貼り付けから **URLを順番どおり**に全部抜き出す。`/video/upload/` は動画、**`/image/upload/` は写真**。
- 写真が混ざっていたら `scripts/imgclip.sh` で数秒のクリップにしてから結合に混ぜる。
- 「やりたいこと」から操作を判断（複数可・順番に適用）:
  - 結合 / つなぐ → concat
  - 〜秒切り出し / 「全体で1分に」 → cut（合計尺から各クリップへ配分）
  - テロップ / 字幕 → telop
  - BGM / 音楽 → music（**音源が無くても下の「BGMを作る」で自作できる**）
  - ショート / 9:16 / 縦型 → vertical

### 2. 編集する（出力は media/out/、入力にURLを直接渡せる）
```bash
# 結合（解像度違いOK。出力は先頭クリップの向き基準・長辺1920に自動縮小）
scripts/concat.sh media/out/out.mp4 "URL1" "URL2" "URL3"

# カット（START〜END。+10 で「10秒間」。4Kも自動で1080pに）
scripts/cut.sh "URL" 5 +10 media/out/c1.mp4

# 縦型ショート化 9:16（ぼかし背景で全面フィル。START/DURATION省略可）
scripts/vertical.sh "URL" media/out/v1.mp4 5 10

# 写真→クリップ（既定5秒。縦型なら SIZE=1080x1920）
scripts/imgclip.sh "IMAGE_URL" media/out/p1.mp4 4.5

# テロップ（日本語OK。POS=top/center/bottom、任意で START END）
POS=top scripts/telop.sh media/out/out.mp4 "オープニング" media/out/out2.mp4 0 3

# BGM合成（MODE=mix/replace, MUSIC_VOL=0..1, FADE=秒。曲が短ければ自動ループ）
MUSIC_VOL=0.18 FADE=4 scripts/music.sh media/out/out.mp4 BGM.m4a media/out/final.mp4
```
- 複数工程は中間ファイル（out.mp4 → out2.mp4 → final.mp4）でつなぐ。元ファイルは上書きしない。
- **ショート動画の定番手順**: 各素材を `vertical.sh`（写真は `SIZE=1080x1920 imgclip.sh`）で 9:16 クリップ化 → `concat.sh` → `music.sh`。
- 4K複数本など重い処理は **2分でタイムアウトするので `run_in_background` で回す**。

### 3. BGMを作る（音源URLが無いとき。全部著作権フリー）
用途に合わせて3系統。**生成した曲はクレジット不要**（PD曲の自作演奏 or 完全自作曲）。

```bash
# A) クラシックの名曲を好きな音色で（一番よく使う）
#    フリーMIDI入手: https://www.flutetunes.com/tunes/<slug>.mid が直リンク
#    （例: schubert-ave-maria, pachelbel-canon-in-d-major, bach-air-on-the-g-string,
#          greensleeves, joplin-the-entertainer, beethoven-fur-elise）
curl -sL -o media/in/song.mid "https://www.flutetunes.com/tunes/schubert-ave-maria.mid"
python3 scripts/midi_arrange.py media/in/song.mid media/in/arr.mid piano   # piano/organ/harpsichord/strings/aria/layers/metal/prog:N（prog:10=オルゴール）
python3 scripts/midi_express.py media/in/arr.mid media/in/arr_e.mid 0.6    # 任意: 感情込め（強弱・rit）
scripts/sf_render.sh media/in/fluidr3.sf2 media/in/arr_e.mid media/in/bgm.m4a med
#  ↑ サウンドフォントが無ければ自動DL。リバーブ none/light/med/heavy

# B) ファミコン(8bit)音源で（サウンドフォント不要・軽い）
python3 scripts/midi_render_synth.py media/in/song.mid media/in/bgm.wav chiptune 999
ffmpeg -y -i media/in/bgm.wav -af "loudnorm=I=-15:TP=-1.5,aformat=channel_layouts=stereo" media/in/bgm.m4a

# C) オリジナル自作曲（オルゴール/RPGバトル風）
python3 scripts/musicbox_gen.py media/in/bgm.wav campfire 60   # twinkle|campfire, 最低秒数
python3 scripts/battle_bgm.py media/in/bgm.wav 40              # 勇ましいバトル曲
```
- 歌入り（ボーカル）が欲しいときは **Sinsy**（無料API）: 歌詞つき MusicXML を
  `POST https://sinsy.sp.nitech.ac.jp/api/synthesize?voice_name=f00001j_dnn_beta5`（`f00002e`=英語）に
  `-F "score=@song.musicxml"` で投げると歌声WAVのパスが返る。伴奏MIDIと amix で重ねる。
- 選曲の目安: 落ち着き=アヴェ・マリア/カノン/G線上のアリア、楽しい=四季・春/The Entertainer、
  眠い=子守唄系+オルゴール(prog:10)、焚き火=campfire自作 or グリーンスリーブス。

### 4. アップロードして保存リンクを返す（1コマンド）
```bash
scripts/deliver.sh media/out/final.mp4
# → URL= / SAVE= / MD= を出力。100MB超は自動で圧縮してからアップされる。
```
返信は `MD=` の行をそのまま使う（**タップできる Markdown リンク**、コピペ不要）:
```
[📥 写真に保存](SAVE...) ／ [▶ 再生](URL...)
```
保存ページの「📥写真に保存」→ 共有シートの「ビデオを保存」で iPhone の写真に入る。

## アルゴリズム正典（SNS向け仕上げの必修ルール）
全文は `references/algorithm_playbook.md`（配信先プリセット表・カット採点ルーブリック・
テロップ良悪例・投稿後の観測指標・EDL書式・出典）。**投稿向け編集では必ず参照する。**
作業中に常に効かせる要点:
- **冒頭2〜3秒が分水嶺**: ロゴ・黒フェード・タイトルカード単体の開始は禁止。本編の動きの
  あるフレームで開始し、冒頭テロップには「検索されたい語」を1語入れる（IGはOCRで読む）。
- **配信先で尺とフェードを変える**: Shorts=20-45秒・Reels=7-15秒・X=20-45秒。
  **Reels/TikTok/ループ想定は `FADE=0`**（フェードアウトはループの継ぎ目を壊す）。
  ループは7-15秒で「終端の絵≒冒頭の絵」。
- **カットは採点で選ぶ**: 動き/光/構図/物語/独自性の5軸0-2点、7点以上を採用
  （冒頭だけは動きor光が2点なら6点でも可）。縦短尺は10秒に5〜7回の視覚変化。
- **テロップ**: 1行13文字以内・最大2行・表示2秒以上・**7文字/秒以内**・60秒に4〜8枚。
  「見えている物の名前を言わない」（✗ランタンです → ○初点火、ちょっと緊張）。
  縦9:16は中央セーフゾーン（幅80%・下から28%以上）に置く。
- **音量は -14 LUFS 目安**で正規化（外部音源は `loudnorm=I=-14:TP=-1.5` を通す）。
- **いいねを乞わない**: 終端はコメント/リプライを誘う質問 or 「誰かに送りたくなる」一言。
  YouTube長尺の登録CTAは尺の55-75%地点、ラスト15-20秒はエンドスクリーン余白。
- **AI生成映像はラベル明示**（2026年5月〜 YouTubeは未ラベルAI映像の推薦を抑制）。
- **iPhone素材の落とし穴**: 縦動画の横倒し（フレームを1枚見て確認。真上撮りは判定不能なので
  ユーザーに確認）／Live Photosは素材外／カメラ間の時刻ソート不可／TikTok透かし入りを
  Reelsに使い回さない。
- **鉄則**: 課金ゼロ設計を崩さない（有料APIは明示指示時のみ）。YouTube自動アップ禁止。

## メモ
- 音声トラックが無いクリップ（写真クリップ含む）が混ざっても concat は動く（無音を自動合成）。
- **Cloudinary無料枠は動画1本100MBまで**。deliver.sh が自動圧縮するので手動対応は不要。
- concat の出力向きは**先頭クリップ基準**（縦を先頭にすると全体が縦になる）。ショートは vertical.sh で先に統一するのが確実。
- BGMが動画より短いときは自動ループ（境界はぶつ切りなので、目立つ場合は長めに生成する）。
- 迷う指定（開始/終了秒・テロップ位置・BGM音量）は妥当な既定で進めて結果リンクを見せる。既定: MUSIC_VOL=0.16〜0.2、FADE=3〜4。
- upload.sh の署名バックエンド（Render）が落ちていたら、`scripts/cloud.sh datauri` + Cloudinary MCP `upload-asset` が代替（〜47MBまで）。
- これは「貼り付け→編集→保存リンク」用。アプリ内「⚡自動で編集」はバックエンドが担当（このスキルは不要）。
