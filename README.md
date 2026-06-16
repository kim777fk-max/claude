# 📱 スマホから動画編集 (Claude Code 動画ツールキット)

ローカル Mac でやっていた動画編集を、**スマホの Claude Code アプリから指示するだけ**で
できるようにするツール集です。ffmpeg を使って以下を処理します。

- ✂️ カット / トリミング
- 🔗 結合（複数クリップをつなぐ）
- 💬 テロップ / 字幕（日本語対応）
- 🎵 BGM 追加・差し替え

---

## 使い方（スマホ）

1. Claude Code アプリ（web / モバイル）でこのリポジトリのセッションを開く
2. 編集したい**動画ファイルを添付**して、やりたいことを日本語で書くだけ。例:
   - 「この動画の 5秒〜20秒だけ切り出して」
   - 「2つの動画をつなげて、最初に『オープニング』ってテロップ入れて」
   - 「この動画に bgm.mp3 を小さめの音量で足して、最後フェードアウト」
3. Claude が `scripts/` のツールで処理し、**完成した動画を送り返します**。

> 仕組み上、添付ファイルはセッションの作業フォルダに入ります。Claude がそれを
> `media/in/` に置いて処理し、結果を `media/out/` に書き出して返します。

---

## 使い方（自分でコマンドを叩く場合）

```bash
# 最初に一度だけ（ffmpeg と日本語フォントを入れる。導入済みなら即終了）
bash scripts/setup.sh

# カット: 5秒〜20秒を取り出す
scripts/cut.sh media/in/a.mp4 00:00:05 00:00:20 media/out/clip.mp4
# カット: 5秒地点から 10秒間
scripts/cut.sh media/in/a.mp4 5 +10 media/out/clip.mp4

# 結合: 複数クリップを1本に（解像度が違っても自動で揃える）
scripts/concat.sh media/out/joined.mp4 media/in/a.mp4 media/in/b.mp4

# テロップ: 画面下に表示（POS=top/center/bottom, SIZE=文字サイズ）
scripts/telop.sh media/in/a.mp4 "本日のまとめ" media/out/telop.mp4
# 0〜3秒だけ上部に大きく表示
POS=top SIZE=64 scripts/telop.sh media/in/a.mp4 "オープニング" media/out/op.mp4 0 3

# BGM: 元音声に重ねる（MUSIC_VOL=音量, FADE=末尾フェード秒）
scripts/music.sh media/in/a.mp4 media/in/bgm.mp3 media/out/withbgm.mp4
# 音声を BGM に差し替え
MODE=replace scripts/music.sh media/in/a.mp4 media/in/bgm.mp3 media/out/bgmonly.mp4
```

各スクリプトの全オプションは、ファイル冒頭のコメントを参照してください。

---

## （任意）セッション開始時に自動で ffmpeg を入れる

毎回 `setup.sh` を手で実行するのが面倒なら、`SessionStart` フックを設定すると
セッション開始時に自動で導入されます。`.claude/settings.json` を作成し、以下を記述:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "bash scripts/setup.sh" }
        ]
      }
    ]
  }
}
```

> このリポジトリでは安全のため自動作成していません。必要なら上記を手動で追加してください。

---

## できること / できないこと

| 機能 | 方法 |
|---|---|
| カット・結合・テロップ・BGM | ✅ `scripts/`（ffmpeg）|
| 自動ハイライト編集 | ✅ Adobe MCP `video_create_quick_cut` |
| 動画リサイズ | ✅ `scripts/`（concat内で対応）/ Adobe MCP `video_resize` |
| 音声の分離（声/BGM/残響） | ✅ Adobe MCP `media_enhance_speech` |
| 発話内容での自動カット | ❌ 未対応（手動で秒数指定）|

## 構成

```
scripts/   編集スクリプト（cut / concat / telop / music / setup / lib）
media/in/  入力（動画・音楽）
media/out/ 出力
CLAUDE.md  Claude 向けの作業手順メモ
```
