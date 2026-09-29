# Windows AI オフィス構想 — 15秒コンセプト映像（HyperFrames 試作）

**これはコンセプト（構想）映像です。実在のサービス・製品ではありません。** 画面上にも常時表示しています。

- 1280×720 / 30fps / 15.0秒 / H.264 / 音声なし（無音）
- 3ビート: ① 18:00 LINE業務連絡を確認 → ② 依頼と期限を抽出 → ③ 翌朝の朝会へ引き継ぎ
- 登場する送信者・文面はすべて架空（取引先A・社内B・店舗C・経理D）。個人情報なし
- LINE / Windows は文字表記のみ。ロゴや商標デザインは使用していない

## 構成
```
composition/
  BRIEF.md                 意図・制約（HyperFrames brief 形式）
  index.html               ホスト（5つのサブコンポジションをマウントするだけ）
  compositions/bg.html     背景（グリッド・時計の針・グロー、15秒）
  compositions/scene1.html 0–5s   18:00 LINE確認（blueprint: transcript-scroll-artifact-reveal / feed-rush）
  compositions/scene2.html 5–10s  依頼・期限の抽出（blueprint: agent-progress-theater / checklist）
  compositions/scene3.html 10–15s 翌朝の朝会へ（grid-card-assemble 系の図解）
  compositions/chrome.html タイトル・「コンセプト」バッジ・ステップ表示（15秒）
  assets/vendor/gsap.min.js GSAP 3.14.2 をローカル同梱（CDN不使用）
```
フォント: Noto Sans JP（日本語）＋ JetBrains Mono（時刻・ラベル）。

## 再現手順（クラウド/Linux コンテナで実行。Windows/Mac ではレンダリングしない）
```bash
bash scripts/setup.sh                         # ffmpeg（リポジトリ既定）
cd prototypes/windows-ai-office-concept
npm install                                   # hyperframes@0.8.91, gsap@3.14.2
npx hyperframes browser ensure                # chrome-headless-shell
cd composition
npx hyperframes check --snapshots             # lint + runtime + layout + motion + contrast
npx hyperframes render --quality delivery --fps 30 --output ../out/windows-ai-office-concept_1280x720_15s.mp4
```

## 注意（検証で分かったこと）
- `hyperframes-creative/typography.md` は Noto Sans JP を「同梱」と記載しているが、v0.8.91 の実ログでは
  **ビルド時に Google Fonts から取得**し（APIキー不要・無料）、`~/.cache/hyperframes/fonts/` にキャッシュして
  決定的な `@font-face` を注入していた。オフライン環境では初回コンパイルに失敗する可能性がある（未検証）。
- HyperFrames の各スキルは `npx hyperframes skills update general-video` でコンテナの `~/.claude/skills/` に導入した（リポジトリ外）。
