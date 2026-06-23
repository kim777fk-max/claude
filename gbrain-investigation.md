# Gbrain 調査レポート

**調査日**: 2026-05-27  
**対象リポジトリ**: [garrytan/gbrain](https://github.com/garrytan/gbrain)  
**ライセンス**: MIT  
**言語**: TypeScript (97%)  
**スター数**: ~19,300（2026-05-27 時点）

---

## 1. 概要

**Gbrain**（ジーブレイン）は、Y Combinator の会長兼 CEO である **Garry Tan** が開発・公開した、AIエージェント向けのオープンソース「知識管理・記憶レイヤー」です。

2026年4月5日に公開され、公開24時間でGitHub スター 5,000超を獲得。OpenClaw・Hermes エージェントフレームワークの「脳」として設計されています。

> "It's not a search engine. It's a brain layer that does synthesis, graph traversal, and gap analysis in one box."
> — Garry Tan

---

## 2. 実運用規模（Garry Tan の実際の脳）

| 項目 | 数値 |
|------|------|
| 管理ページ数 | 146,646 ページ |
| 管理人物数 | 24,585 人 |
| 管理企業数 | 5,339 社 |
| 自律クロンジョブ | 66 個 |

会議、メール、ツイート、音声通話、アイデアなどを自動取り込み・エンリッチメント・引用修正・記憶統合しながら自律稼働しています。

---

## 3. 主要機能

### 3.1 クエリの2モード

| モード | コマンド | 説明 |
|--------|----------|------|
| 生検索 | `gbrain search` | ハイブリッドスコアリング（ベクトル＋キーワード＋RRF）で上位ページを返す。LLMコストなし。 |
| 合成層 | `gbrain think` | 検索結果を統合した回答＋引用＋ギャップ分析を提供。 |

### 3.2 自己配線型知識グラフ

- ページ書き込み時に**LLM呼び出しなし**で自動的にグラフエッジを生成
- 型付きエッジ（`attended`、`works_at`、`invested_in` など）
- **ベンチマーク（BrainBench）**: P@5 49.1% / R@5 97.9%（240ページコーパス）
- グラフなし変種より **+31.4ポイント**向上

### 3.3 43個のビルトインスキル

`skills/RESOLVER.md` にルーティング定義：

- シグナルキャプチャ・取り込み（思考、メディア、会議）
- エンリッチメント（人物・企業の自動補完）
- クエリ・脳操作
- 引用修正・日次タスク
- クロン・レポート・音声・スキル作成・評価・マイグレーション

---

## 4. アーキテクチャ

### 4.1 ストレージエンジン（2択）

| エンジン | 用途 | 特徴 |
|----------|------|------|
| **PGLite** | 個人・小規模（~50K ページ） | Postgres 17 WASM版。設定不要でローカル起動。 |
| **Postgres + pgvector** | チーム・大規模 | Supabase または自己ホスト。マルチマシン対応。 |

### 4.2 ブレイン = Git リポジトリ

- **マークダウンファイルが真実のソース（Source of Truth）**
- Git 削除 → DB ソフトデリート（整合性保持）
- チーム共有・パブリック公開対応

### 4.3 2つの組織軸

| 軸 | 説明 |
|----|------|
| **ブレイン** | データベース単位（個人脳、チームマウント） |
| **ソース** | ブレイン内のリポジトリ（wiki、エッセイ、知識ベース） |

### 4.4 スキーマパック（脳の構造定義）

| パック | バージョン | タイプ数 |
|--------|------------|----------|
| `gbrain-base-v2` | v0.41.22+ | 15タイプ（person、company、media、tweet、analysis 等） |
| `gbrain-base` | レガシー | 24タイプ |
| `gbrain-recommended` | 拡張版 | +13ディレクトリ |

スキーマは7段階解決チェーン（CLI引数→環境変数→DB設定→config.json→デフォルト）で決定。

---

## 5. インストール方法

### 推奨：AIエージェント経由（OpenClaw / Hermes）

```
INSTALL_FOR_AGENTS.md の指示に従う（約30分で完全稼働）
```

### CLI スタンドアロン

```bash
bun install -g github:garrytan/gbrain
gbrain init --pglite
gbrain doctor
gbrain import ~/notes/
gbrain query "テーマは何か？"
```

### 既存エージェントへの統合

- Codex、Claude Code、Cursor 対応

---

## 6. MCP（Model Context Protocol）連携

### stdio モード（Claude Code / Cursor 用）

```bash
claude mcp add gbrain -- gbrain serve
```

### HTTP モード（OAuth 2.1、マルチユーザー）

```bash
gbrain serve --http
```

HTTP版機能：
- DCRスタイルのクライアント登録
- スコープ管理（read / write / admin）
- レート制限
- `/admin` ダッシュボード

---

## 7. データ取り込み

```bash
# テキストキャプチャ
gbrain capture "保存したい考え"

# ファイルキャプチャ
gbrain capture --file ./notes/today.md

# stdin パイプ
echo "パイプから" | gbrain capture --stdin

# Webhook経由（Zapier / Apple Shortcuts 等）
curl -X POST https://your-brain/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/markdown" \
  -d "# アイデア"
```

---

## 8. 埋め込みプロバイダー（16種類対応）

| プロバイダー | 備考 |
|-------------|------|
| ZeroEntropy | デフォルト |
| OpenAI | 広く利用 |
| OpenRouter | — |
| Voyage AI | — |
| Google Gemini | — |
| Ollama | ローカル実行 |
| その他 | 合計16種類 |

**リランカー**: ZeroEntropy `zerank-2`（デフォルト）/ llama.cpp ローカル版

---

## 9. マルチユーザー（Company Brain）

- チーム10〜50人規模向けの「企業脳」機能
- 各メンバーは**自分専用のスライス**を持ちログインでスコープされる
- クエリは許可されたデータのみ参照
- OAuth 2.1でアクセス制御

---

## 10. エコシステム（関連リポジトリ）

| リポジトリ | スター | 説明 |
|-----------|--------|------|
| [garrytan/gbrain](https://github.com/garrytan/gbrain) | 19,317 | 本体 |
| [garrytan/gbrain-evals](https://github.com/garrytan/gbrain-evals) | 185 | 評価フレームワーク |
| [huytieu/COG-second-brain](https://github.com/huytieu/COG-second-brain) | 494 | gbrain インスパイアの自己進化セカンドブレイン |
| [mage0535/hermes-memory-installer](https://github.com/mage0535/hermes-memory-installer) | 77 | 4層記憶体アーキテクチャインストーラ |
| [howardpen9/hermes-gbrain-bridge](https://github.com/howardpen9/hermes-gbrain-bridge) | 35 | Hermes セッション→gbrain マークダウン変換 |
| [durang/gbrain-http-wrapper](https://github.com/durang/gbrain-http-wrapper) | 16 | OAuth 2.1 HTTP フロントエンド |
| [imphillip/gbrain-openclaw](https://github.com/imphillip/gbrain-openclaw) | 10 | OpenClaw 向け個人知識ブレイン |

---

## 11. ドキュメント構成

```
docs/
├── INSTALL.md              # 全インストール手順
├── architecture/           # システム設計・検索理論
├── guides/                 # 操作ガイド
├── integrations/           # 外部連携
├── mcp/                    # クライアント別MCP設定
├── tutorials/company-brain.md  # チーム導入ガイド
└── GBRAIN_SKILLPACK.md     # スキルパック一覧
AGENTS.md                   # エージェント向けエントリーポイント
CLAUDE.md                   # Claude Code 向けエントリーポイント
```

---

## 12. 総評

Gbrain は「AIエージェントのための永続記憶・知識グラフ基盤」として、以下の点で注目に値します：

1. **実運用実績**: Garry Tan 自身が14万ページ規模で本番稼働させている
2. **LLMコストの最適化**: グラフ抽出をLLMなしで実現し、必要な場面のみLLMを使用
3. **MCP ネイティブ**: Claude Code・Cursor・ChatGPT 等のAIツールと即座に連携可能
4. **MIT ライセンス**: 商用利用・改変・再配布が自由
5. **エコシステムの成長**: 公開1ヶ月強で関連リポジトリが多数生まれている

---

## 参考リンク

- [garrytan/gbrain - GitHub](https://github.com/garrytan/gbrain)
- [GBrain Review - vectorize.io](https://vectorize.io/articles/gbrain-review)
- [MarkTechPost 解説記事](https://www.marktechpost.com/2026/05/22/a-step-by-step-coding-tutorial-to-implement-gbrain-the-self-wiring-memory-layer-built-by-y-combinators-garry-tan-for-ai-agents/)
- [What Is g-brain? - Little Might](https://www.littlemight.com/g-brain/)
- [Hermes Agent での紹介](https://hermesatlas.com/projects/garrytan/gbrain)
