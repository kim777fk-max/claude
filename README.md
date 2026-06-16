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

### 📦 大きい動画でチャット添付できないとき（Cloudinary 経由）

スマホの動画はサイズが大きく、チャットに直接添付できないことがあります。その場合は
**Cloudinary（このセッションに連携済み）** を経由すれば上限を回避できます。

1. 動画を Cloudinary にアップロード（アプリ / Web / 共有から）
2. Claude に「Cloudinary の○○を編集して」と伝える（URL を貼ってもOK）
3. Claude が **URL から直接ダウンロードして編集** → 結果を Cloudinary に戻し、
   **共有リンク（secure_url）で返します**

```bash
# 入力は URL を直接渡せる（ffmpeg がストリーム取得）
scripts/cut.sh "https://res.cloudinary.com/<cloud>/video/upload/.../in.mp4" 5 +10 media/out/clip.mp4

# 出力を Cloudinary へ戻す準備（約47MBまで）。生成した data URI を
# upload-asset MCP ツールの file に渡すと公開URLが返る
scripts/cloud.sh datauri media/out/clip.mp4 > /tmp/clip.datauri
```

> 動作確認済み: Cloudinary URL の取得 → ffmpeg で編集 → アップロードして公開URL取得、まで往復成功。

---

## 📲 スマホアプリ（アップローダー）`app/`

「アプリを開く → 写真/動画を選ぶ → クラウドへアップ → ファイル名とプロンプトが出る」を
そのまま形にした **インストール可能なWebアプリ（PWA）** です。バックエンド不要。

### できること
1. アプリを開く（ホーム画面に追加すればアプリのように起動）
2. スマホのライブラリ／カメラから動画を選択
3. Cloudinary へ直接アップロード（進捗バー付き）
4. **アップしたファイル名 + URL + プロンプト欄**が表示される
5. 「Claude用にコピー」または「共有」→ Claude Code に貼り付けるだけ

### 公開方法（GitHub Pages 例）
`app/` を GitHub Pages で配信すれば、スマホのブラウザで開けます。
（Settings → Pages → Branch を選び `/app` を公開、など）
ローカル確認は `python3 -m http.server -d app 8080` → `http://localhost:8080`。

### 初回設定（1回だけ）
アプリ右上の ⚙️ で以下を入力：
- **クラウド名 (cloud name)** … 例 `dftjmz7l5`
- **未署名アップロードプリセット** … Cloudinary コンソール → Settings → Upload →
  Upload presets → Add upload preset → **Signing Mode = Unsigned** で作成した名前
- 保存先フォルダ（任意, 既定 `claude-edits`）

> 未署名プリセットを使うことで、APIシークレットをアプリに置かずに安全にアップロードできます。

### アプリからの受け渡し文（自動生成）
```
Cloudinary の動画を編集してください。
ファイル名: <public_id>
URL: <secure_url>
やりたいこと: <あなたのプロンプト>

編集後はCloudinaryにアップロードして、共有リンクを返してください。
```
これを Claude Code に貼ると、ツールが URL から動画を取得して編集し、結果リンクを返します。

> 補足: アプリから Claude Code を直接起動する公式APIは無いため、受け渡しは
> ワンタップのコピー／共有にしています。

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
