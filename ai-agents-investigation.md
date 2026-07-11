# AIエージェント調査レポート：Gbrain & OpenHuman

**調査日**: 2026-05-28  
**調査者**: Claude Code (claude-sonnet-4-6)

---

## 目次

1. [Gbrain](#1-gbrain)
2. [OpenHuman](#2-openhuman)
3. [比較まとめ](#3-比較まとめ)
4. [参考リンク](#4-参考リンク)

---

## 1. Gbrain

**リポジトリ**: [garrytan/gbrain](https://github.com/garrytan/gbrain)  
**ライセンス**: MIT  
**言語**: TypeScript (97%)  
**スター**: ~19,300（2026-05-28）

### 何者か

Y Combinator CEO **Garry Tan** が2026年4月5日に公開した、AIエージェント向けの**知識管理・記憶レイヤー**。単なる検索ツールではなく「脳層」として、合成・グラフ走査・ギャップ分析を1つに統合。OpenClaw / Hermes エージェントフレームワークの「脳」として設計されている。

公開24時間で★5,000超。Garry Tan 本人が146,646ページ・24,585人・5,339社・66クロンジョブを自律稼働させている。

### コアアーキテクチャ

```
データ取り込み（markdown）
    ↓
自己配線型知識グラフ生成（LLMなし）
    ↓
ハイブリッドインデックス（ベクトル + キーワード + RRF）
    ↓ gbrain search   ↓ gbrain think
  生検索結果         合成回答 + 引用 + ギャップ分析
```

**ストレージエンジン（2択）**

| エンジン | 用途 |
|----------|------|
| PGLite（Postgres 17 WASM） | 個人・~50Kページ、設定不要 |
| Postgres + pgvector | チーム・大規模、Supabase or 自己ホスト |

**マークダウンファイルが Source of Truth**（Git管理、git削除→DBソフトデリート）

### 主要機能

| 機能 | 詳細 |
|------|------|
| **gbrain search** | ハイブリッドスコアリング（ベクトル+キーワード+RRF）。LLMコストなし。 |
| **gbrain think** | 検索結果を統合した散文回答＋明示的引用＋ギャップ分析 |
| **自己配線グラフ** | 型付きエッジ自動生成（`attended` / `works_at` / `invested_in` 等）。LLM不要。 |
| **43スキル** | キャプチャ・エンリッチ・クロン・音声・評価・マイグレーション等 |
| **Company Brain** | OAuth 2.1スコープ管理付きチーム（10〜50人）多ユーザー機能 |

**ベンチマーク（BrainBench, 240ページコーパス）**

- P@5: 49.1% / R@5: 97.9%
- グラフなし変種より **+31.4ポイント** 向上

### MCP / クライアント連携

```bash
# Claude Code
claude mcp add gbrain -- gbrain serve

# HTTP（OAuth 2.1）
gbrain serve --http
```

対応クライアント: Claude Code、Cursor、Windsurf、ChatGPT、Claude Desktop

### インストール

```bash
# CLIスタンドアロン
bun install -g github:garrytan/gbrain
gbrain init --pglite
gbrain doctor

# データ取り込み
gbrain capture "メモしたい内容"
gbrain capture --file ./notes/today.md
gbrain import ~/notes/
```

### エコシステム（主な関連リポジトリ）

| リポジトリ | ★ | 説明 |
|-----------|---|------|
| garrytan/gbrain-evals | 185 | 評価フレームワーク |
| huytieu/COG-second-brain | 494 | gbrain インスパイアの自己進化セカンドブレイン |
| mage0535/hermes-memory-installer | 77 | 4層記憶体アーキテクチャ |
| howardpen9/hermes-gbrain-bridge | 35 | Hermes → gbrain マークダウン変換 |
| durang/gbrain-http-wrapper | 16 | OAuth 2.1 HTTP フロントエンド |

---

## 2. OpenHuman

**リポジトリ**: [tinyhumansai/openhuman](https://github.com/tinyhumansai/openhuman)  
**ライセンス**: GNU GPL-3.0  
**言語**: Rust (61.3%) / TypeScript (35.0%)  
**スター**: ~28,700（2026-05-28）  
**初回リリース**: v0.53.43（2026-05-13）

### 何者か

カリフォルニアの開発者集団 **tinyhumansai** が開発したオープンソースの**デスクトップ型パーソナルAIエージェント**。コアコンセプトは「エージェントはプロンプトを打つ前からユーザーのコンテキストを把握しているべき」。

公開7日間で★8,000超・ユーザー5,000+。週次成長率150%。GitHub Trending 1位到達。

### コアアーキテクチャ

```
118+ 外部サービス（OAuth接続）
    ↓ 20分ごと自動ポーリング
canonical Markdown に正規化
    ↓
TokenJuice 圧縮（最大80%削減）
    ↓
チャンキング（≤3,000トークン）→ スコアリング
    ↓
Memory Tree（階層的要約ツリー）
    ↓
ローカル SQLite 保存（Obsidian互換 Markdown ボルト）
```

**Rust / Tauri 製デスクトップアプリ**（macOS / Windows / Linux）

### 主要機能

| 機能 | 詳細 |
|------|------|
| **Memory Tree** | ローカルSQLiteに最大10億トークンの個人記憶を保存。検査・編集可能。 |
| **118+ OAuth統合** | Gmail・GitHub・Slack・Notion・Google Calendar・Stripe等。APIキー不要。 |
| **20分自動同期** | 接続サービスを定期ポーリング。操作不要で常にコンテキストが最新。 |
| **TokenJuice** | HTML→Markdown変換・URL短縮・重複排除で最大80%トークン削減。 |
| **200+ モデル対応** | 単一アカウントで複数モデルへ自動ルーティング。APIキー管理不要。 |
| **音声** | STT / TTS / Google Meet 統合 |

### インストール

```bash
# macOS
brew tap tinyhumansai/core && brew install openhuman

# Linux（apt）
curl -fsSL https://apt.tinyhumans.ai/key.gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://apt.tinyhumans.ai /"
sudo apt install openhuman

# Windows
# 署名済み MSI をダウンロードして実行
```

### 評価（PrimeAIcenter: 72/100）

**強み**
- ✅ ローカル永続記憶（プライバシーファースト）
- ✅ セットアップ不要・ターミナル不要
- ✅ TokenJuice によるコスト効率
- ✅ 完全オープンソース（GPL-3.0）

**弱み**
- ⚠️ 早期ベータ（信頼性に課題）
- ⚠️ インストールパスの安全性未検証箇所あり
- ⚠️ 非技術ユーザー・本番環境には未推奨

---

## 3. 比較まとめ

| 観点 | Gbrain | OpenHuman |
|------|--------|-----------|
| **形態** | CLI / MCP サーバー（ライブラリ） | デスクトップアプリ（GUI） |
| **対象ユーザー** | AIエージェント開発者 | 個人ユーザー（非技術者も可） |
| **記憶方式** | 自己配線グラフ（pgvector） | Memory Tree（SQLite + Markdown） |
| **外部連携** | MCP経由でAIツールと連携 | 118+ サービス OAuth |
| **検索性能** | BrainBench実績あり（+31.4pt） | 未公開 |
| **コスト最適化** | グラフでLLM呼び出し削減 | TokenJuice（最大80%削減） |
| **ライセンス** | MIT | GPL-3.0 |
| **言語** | TypeScript | Rust + TypeScript |
| **スター** | ~19,300 | ~28,700 |
| **成熟度** | やや高い（本番稼働実績あり） | 早期ベータ |

### ポジショニング

```
         個人ユーザー向け
               ↑
    OpenHuman  │  （デスクトップ統合エージェント）
               │
ライブラリ ────┼──── アプリ
               │
     Gbrain    │  （開発者向け知識レイヤー）
               ↓
         開発者向け
```

**補完関係**: OpenHuman（データ収集・記憶UI）のバックエンドに Gbrain（知識グラフ・MCP連携）を統合する試みがコミュニティで進んでいる。

---

## 4. 参考リンク

### Gbrain
- [garrytan/gbrain - GitHub](https://github.com/garrytan/gbrain)
- [GBrain Review - vectorize.io](https://vectorize.io/articles/gbrain-review)
- [MarkTechPost 技術解説](https://www.marktechpost.com/2026/05/22/a-step-by-step-coding-tutorial-to-implement-gbrain-the-self-wiring-memory-layer-built-by-y-combinators-garry-tan-for-ai-agents/)
- [What Is g-brain? - Little Might](https://www.littlemight.com/g-brain/)

### OpenHuman
- [tinyhumansai/openhuman - GitHub](https://github.com/tinyhumansai/openhuman)
- [OpenHuman Review 2026 - PrimeAIcenter](https://primeaicenter.com/openhuman-review/)
- [OpenHuman explainer - mager.co](https://www.mager.co/blog/2026-05-25-openhuman-explainer/)
- [GitHub Trending 解説 - TechTimes](https://www.techtimes.com/articles/316731/20260516/agent-that-reads-you-first-openhuman-tops-github-trending-inverting-playbook.htm)
- [5分セットアップガイド - Alpha Signal](https://alphasignalai.substack.com/p/how-openhuman-works-and-how-to-set)
