# OpenHuman 調査レポート

**調査日**: 2026-05-27  
**対象リポジトリ**: [tinyhumansai/openhuman](https://github.com/tinyhumansai/openhuman)  
**ライセンス**: GNU GPL-3.0  
**言語**: Rust (61.3%) / TypeScript (35.0%)  
**スター数**: ~28,700（2026-05-27 時点）  
**フォーク数**: ~2,700

---

## 1. 概要

**OpenHuman** は、カリフォルニアの開発者集団 **tinyhumansai** が2026年5月13日に公開した、オープンソースの**パーソナルAIエージェント（デスクトップアプリ）**です。

> "Your Personal AI super intelligence. Private, Simple and extremely powerful."

**コアコンセプト**：エージェントはユーザーが何かを入力する「前」から、そのユーザーのコンテキストを把握していなければならない。セッションメモリではなく、**ローカルに蓄積される永続記憶**が差別化の核。

### 成長の速さ
- 公開7日間で★8,000超・ユーザー5,000+
- 週次成長率 150%
- GitHub Trending 1位到達（2026年5月）
- 現在★28,700超

---

## 2. 主な特徴

### 2.1 118+ サービス統合（ワンクリック OAuth）

API キー設定不要。OAuth 認証一発で接続：

| カテゴリ | サービス例 |
|---------|-----------|
| コミュニケーション | Gmail、Slack |
| 開発 | GitHub |
| 生産性 | Notion、Google Calendar、Google Drive、Linear、Jira |
| 決済 | Stripe |
| その他 | 合計 118+ |

### 2.2 20分ごとの自動同期

- 全接続サービスを定期ポーリング
- メール・カレンダー・コミット・ドキュメント編集を自動取得
- ユーザーが何も操作しなくても翌朝には前夜のコンテキストが揃っている

### 2.3 Memory Tree アーキテクチャ

```
外部サービス
    ↓ 20分ごと自動取得
正規化（canonical Markdown）
    ↓
チャンキング（≤3,000トークン）
    ↓
スコアリング
    ↓
階層的要約ツリー（Memory Tree）
    ↓
ローカル SQLite 保存
```

- **Obsidian 互換ボルト形式**でMarkdownを整理・管理
- ローカルSQLiteに最大**10億トークン**の個人記憶を保存可能
- 保存内容は検査・編集可能（他のエージェントにはない透明性）
- 再起動後も永続保持

---

## 3. 技術アーキテクチャ

### 3.1 デスクトップファースト（Rust / Tauri）

| 要素 | 技術 |
|------|------|
| バックエンド | Rust |
| フロントエンド | TypeScript |
| デスクトップフレームワーク | Tauri |
| ストレージ | ローカル SQLite |

**対応OS**: macOS / Windows / Linux

### 3.2 TokenJuice 圧縮層

ツール実行結果がモデルに届く前に自動処理：

1. HTML → Markdown 変換
2. 非ASCII文字の除去
3. URLの短縮
4. 重複出力の排除

→ **最大80%のトークン削減**（実測70%確認）

元は [vincentkoc/tokenjuice](https://github.com/vincentkoc/tokenjuice) の移植版。コスト削減に大きく貢献。

### 3.3 モデルルーティング

- **200以上のAIモデル**に対応
- 単一アカウントで複数モデルへのリクエストを自動ルーティング
- APIキー管理不要

---

## 4. インストール方法

### macOS（推奨）

```bash
brew tap tinyhumansai/core
brew install openhuman
```

### Linux

```bash
# 署名済み apt リポジトリ経由
curl -fsSL https://apt.tinyhumans.ai/key.gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://apt.tinyhumans.ai /"
sudo apt install openhuman
```

### Windows

- 署名済み MSI ファイルをダウンロードしてインストール

---

## 5. ビルトイン機能

| 機能 | 詳細 |
|------|------|
| Web サーチ | 内蔵検索ツール |
| スクレイパー | Web コンテンツ取得 |
| コード環境 | コード実行環境 |
| 音声入力 | 音声認識（STT） |
| TTS | テキスト読み上げ |
| Google Meet 統合 | 会議への自動参加・記録 |

---

## 6. 他エージェントとの比較

| ツール | 特徴 | 対象ユーザー |
|--------|------|-------------|
| **OpenHuman** | UI優先、セットアップ不要、マネージドバックエンド、118+統合 | 非技術ユーザー〜パワーユーザー |
| **OpenClaw** | ヘッドレス型、フル制御、高カスタマイズ | 開発者 |
| **Hermes** | 自己学習レイヤー搭載、エージェント開発向け | 開発者 |
| **Gbrain** | 知識グラフ＋合成、MCP ネイティブ、マークダウン管理 | 開発者・上級ユーザー |

---

## 7. 評価（PrimeAIcenter: 72/100）

### 強み
- ✅ 革新的な Memory Tree アーキテクチャ
- ✅ プライバシーファースト設計（ローカル保存）
- ✅ 完全オープンソース（GPL-3.0）
- ✅ 200+モデル対応
- ✅ 設定不要・ターミナル不要
- ✅ TokenJuice によるコスト効率

### 弱み
- ⚠️ 早期ベータ段階（信頼性に課題あり）
- ⚠️ インストール方法の安全性懸念（一部のインストールパスが未検証）
- ⚠️ 自己報告の圧縮率が未独立検証
- ⚠️ 非技術ユーザー・本番環境には未推奨

---

## 8. プロジェクト情報

| 項目 | 内容 |
|------|------|
| 開発元 | tinyhumansai（カリフォルニア） |
| 初回リリース | v0.53.43（2026-05-13） |
| 更新頻度 | ほぼ毎日 |
| ライセンス | GNU GPL-3.0 |
| GitHub org | [openhuman-ai](https://github.com/openhuman-ai) |

---

## 9. Gbrain との関係・比較

| 観点 | OpenHuman | Gbrain |
|------|-----------|--------|
| **対象** | 個人ユーザー向けデスクトップアプリ | AIエージェント向け知識レイヤー（ライブラリ） |
| **UI** | GUI あり（デスクトップアプリ） | CLI / MCP サーバー |
| **記憶方式** | Memory Tree（SQLite + Markdownボルト） | 自己配線グラフ（SQLite/Postgres + pgvector） |
| **検索** | 未公開のスコアリング | ハイブリッド（ベクトル+キーワード+RRF）BrainBench実績 |
| **外部連携** | 118+ サービス OAuth | MCP 経由で Claude Code / Cursor / ChatGPT |
| **開発言語** | Rust + TypeScript | TypeScript |
| **ライセンス** | GPL-3.0 | MIT |
| **スター** | ~28,700 | ~19,300 |

両者は競合というより**補完関係**に近く、OpenHuman（データ収集・記憶UI）のバックエンドに Gbrain（知識グラフ・MCP）を組み合わせる試みも[コミュニティで議論されている](https://github.com/howardpen9/hermes-gbrain-bridge)。

---

## 10. 参考リンク

- [tinyhumansai/openhuman - GitHub](https://github.com/tinyhumansai/openhuman)
- [OpenHuman Review 2026 - PrimeAIcenter](https://primeaicenter.com/openhuman-review/)
- [OpenHuman explainer - mager.co](https://www.mager.co/blog/2026-05-25-openhuman-explainer/)
- [GitHub Trending 解説 - TechTimes](https://www.techtimes.com/articles/316731/20260516/agent-that-reads-you-first-openhuman-tops-github-trending-inverting-playbook.htm)
- [5分セットアップガイド - Alpha Signal](https://alphasignalai.substack.com/p/how-openhuman-works-and-how-to-set)
- [ローカル記憶解説 - pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/2704/openhuman-open-source-ai-agent-local-memory)
- [Product Hunt](https://www.producthunt.com/products/openhuman)
