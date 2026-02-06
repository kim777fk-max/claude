# AI Stock Advisor (AISA)

AI駆動の株式自動投資ツール。政治・経済ニュースをAIが分析し、証券会社APIと連携して自動売買を行います。

## Architecture

```
CLI (aisa) --> StrategyEngine --> DataAggregator --> Yahoo Finance / News API
                    |                                       |
                    v                                       v
            TradeExecutor --> RiskManager          AI Analyzer (OpenAI/Anthropic)
                    |
                    v
              Broker (Paper / Alpaca)
```

## Features

- **AI分析エンジン**: OpenAI GPT-4o / Anthropic Claude を使用して市場データとニュースを分析
- **自動売買**: AI分析結果に基づき自動で売買注文を実行
- **証券会社API連携**: Alpaca (米国株) 対応。抽象化レイヤーにより他の証券会社も追加可能
- **リスク管理**: ポジション制限、損切り、1日の取引回数制限、注文金額上限
- **ペーパートレーディング**: デフォルトでシミュレーションモード（実際のお金は使わない）
- **CLIインターフェース**: `aisa` コマンドで簡単操作

## Safety

安全性はアーキテクチャに組み込まれています:

| 保護機能 | デフォルト値 |
|---------|------------|
| ペーパーモード | `有効` (実取引は明示的に `--live` フラグが必要) |
| 最大ポジション比率 | ポートフォリオの10% |
| 最大エクスポージャー | ポートフォリオの80% |
| 自動損切り | 5% |
| 1日の取引上限 | 10回 |
| 注文金額上限 | $10,000 |

## Quick Start

### 1. Install

```bash
pip install -e .
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your API keys
```

Required API keys:
- **AI Provider**: `AISA_OPENAI_API_KEY` or `AISA_ANTHROPIC_API_KEY`
- **Broker** (optional): `AISA_ALPACA_API_KEY` + `AISA_ALPACA_API_SECRET`
- **News** (optional): `AISA_NEWS_API_KEY`

### 3. Usage

```bash
# Analyze a single stock
aisa analyze AAPL

# Show current config
aisa config

# Show portfolio (paper trading)
aisa portfolio

# Start automated trading loop (paper mode)
aisa run --symbols AAPL,MSFT,GOOGL --interval 60

# Live trading (CAUTION - real money!)
aisa run --symbols AAPL --live
```

## Project Structure

```
src/aistockadvisor/
  config/       # Settings (env vars, risk limits)
  models/       # Pydantic data models (orders, portfolio, analysis)
  data/         # Market data (Yahoo Finance) and news providers
  ai/           # AI analyzers (OpenAI, Anthropic) and prompt templates
  broker/       # Broker implementations (Paper, Alpaca)
  strategy/     # Trading strategies (AI-driven)
  portfolio/    # Portfolio management and risk controls
  execution/    # Trade execution with mandatory risk validation
  cli/          # CLI interface (Typer + Rich)
```

## How It Works

1. **Data Collection**: Yahoo Finance から株価データ、NewsAPI からニュースを取得
2. **AI Analysis**: 収集したデータを OpenAI/Anthropic に送信し、投資シグナルを生成
3. **Strategy**: AIの分析結果を基に具体的な売買注文を作成
4. **Risk Check**: リスクマネージャーが注文を検証（ポジション制限、エクスポージャー等）
5. **Execution**: リスクチェック通過後、ブローカーAPIで注文を実行

## Extending

### Add a New Broker

1. Create `src/aistockadvisor/broker/yourbroker.py`
2. Implement `BaseBroker` abstract class
3. Register in `broker/factory.py`

### Add a New AI Provider

1. Create `src/aistockadvisor/ai/your_analyzer.py`
2. Implement `BaseAIAnalyzer` abstract class
3. Register in `ai/factory.py`

## Development

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Lint
ruff check src/ tests/

# Type check
mypy src/
```

## License

MIT
