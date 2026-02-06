"""Main CLI application using Typer."""

from __future__ import annotations

import asyncio
import logging
import sys
import time

import typer
from rich.console import Console

from aistockadvisor import __version__

app = typer.Typer(
    name="aisa",
    help="AI Stock Advisor (AISA) - AI-driven stock investment tool",
    add_completion=False,
)
console = Console()


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


@app.command()
def analyze(
    symbol: str = typer.Argument(..., help="Stock symbol to analyze (e.g. AAPL)"),
    provider: str = typer.Option("openai", "--provider", "-p", help="AI provider: openai or anthropic"),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Run AI analysis on a single stock symbol."""
    setup_logging("DEBUG" if verbose else "INFO")
    asyncio.run(_analyze(symbol.upper(), provider))


async def _analyze(symbol: str, provider: str) -> None:
    from aistockadvisor.ai.factory import create_analyzer
    from aistockadvisor.cli.output import print_analysis
    from aistockadvisor.config.settings import Settings
    from aistockadvisor.data.aggregator import DataAggregator
    from aistockadvisor.data.yahoo import YahooMarketData

    settings = Settings()
    settings.ai_provider = provider

    console.print(f"Fetching data for [bold]{symbol}[/bold]...")
    market = YahooMarketData()
    aggregator = DataAggregator(market=market)
    context = await aggregator.get_analysis_context(symbol)

    console.print(f"Running AI analysis ({provider})...")
    analyzer = create_analyzer(settings)
    result = await analyzer.analyze_market(context)

    print_analysis(result)


@app.command()
def portfolio(
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Display current portfolio and positions."""
    setup_logging("DEBUG" if verbose else "INFO")
    asyncio.run(_portfolio())


async def _portfolio() -> None:
    from aistockadvisor.broker.factory import create_broker
    from aistockadvisor.cli.output import print_portfolio
    from aistockadvisor.config.settings import Settings
    from aistockadvisor.portfolio.manager import PortfolioManager

    settings = Settings()
    broker = create_broker(settings)
    manager = PortfolioManager(broker)
    snapshot = await manager.get_snapshot()

    console.print(f"Broker: [bold]{broker.broker_name}[/bold]")
    print_portfolio(snapshot)


@app.command()
def run(
    interval: int = typer.Option(60, "--interval", "-i", help="Analysis interval in minutes"),
    symbols: str = typer.Option("", "--symbols", "-s", help="Comma-separated symbols (overrides config)"),
    live: bool = typer.Option(False, "--live", help="Enable live trading (CAUTION)"),
    cycles: int = typer.Option(0, "--cycles", "-c", help="Number of cycles (0=infinite)"),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    """Start the continuous AI trading loop."""
    setup_logging("DEBUG" if verbose else "INFO")

    if live:
        console.print("[bold red]WARNING: Live trading mode enabled![/bold red]")
        console.print("Real money will be used. Press Ctrl+C to abort.")
        try:
            time.sleep(5)
        except KeyboardInterrupt:
            console.print("Aborted.")
            raise typer.Exit()

    asyncio.run(_run(interval, symbols, live, cycles))


async def _run(interval: int, symbols_str: str, live: bool, max_cycles: int) -> None:
    from aistockadvisor.ai.factory import create_analyzer
    from aistockadvisor.broker.factory import create_broker
    from aistockadvisor.cli.output import print_cycle_results, print_portfolio
    from aistockadvisor.config.settings import Settings
    from aistockadvisor.data.aggregator import DataAggregator
    from aistockadvisor.data.yahoo import YahooMarketData
    from aistockadvisor.execution.executor import TradeExecutor
    from aistockadvisor.portfolio.manager import PortfolioManager
    from aistockadvisor.portfolio.risk import RiskManager
    from aistockadvisor.strategy.ai_driven import AIDrivenStrategy
    from aistockadvisor.strategy.engine import StrategyEngine

    settings = Settings()
    if live:
        settings.broker_paper_mode = False

    watchlist = (
        [s.strip().upper() for s in symbols_str.split(",") if s.strip()]
        if symbols_str
        else settings.watchlist_symbols
    )

    # Build pipeline
    broker = create_broker(settings)
    market = YahooMarketData()
    aggregator = DataAggregator(market=market)
    analyzer = create_analyzer(settings)
    strategy = AIDrivenStrategy(analyzer)
    risk_manager = RiskManager(settings)
    portfolio_manager = PortfolioManager(broker)
    executor = TradeExecutor(broker, risk_manager, portfolio_manager)
    engine = StrategyEngine(aggregator, strategy, executor, portfolio_manager, watchlist)

    console.print(f"\n[bold]AI Stock Advisor[/bold]")
    console.print(f"  Broker:    {broker.broker_name}")
    console.print(f"  Paper:     {broker.is_paper}")
    console.print(f"  AI:        {settings.ai_provider} ({settings.ai_model})")
    console.print(f"  Watchlist: {', '.join(watchlist)}")
    console.print(f"  Interval:  {interval} min")
    console.print()

    cycle = 0
    while True:
        cycle += 1
        console.print(f"\n--- Cycle {cycle} ---")

        results = await engine.run_cycle()
        print_cycle_results(results)

        snapshot = await portfolio_manager.get_snapshot()
        print_portfolio(snapshot)

        if max_cycles > 0 and cycle >= max_cycles:
            console.print("Max cycles reached. Stopping.")
            break

        console.print(f"Next cycle in {interval} minutes. Press Ctrl+C to stop.")
        try:
            await asyncio.sleep(interval * 60)
        except asyncio.CancelledError:
            break

    console.print("[bold]Trading loop stopped.[/bold]")


@app.command()
def config() -> None:
    """Show current configuration (secrets masked)."""
    from aistockadvisor.config.settings import Settings

    settings = Settings()
    console.print("\n[bold]Current Configuration[/bold]")
    console.print(f"  Broker:          {settings.broker_name}")
    console.print(f"  Paper Mode:      {settings.broker_paper_mode}")
    console.print(f"  AI Provider:     {settings.ai_provider}")
    console.print(f"  AI Model:        {settings.ai_model}")
    console.print(f"  Watchlist:       {settings.watchlist}")
    console.print(f"  Max Position:    {settings.max_position_pct:.0%}")
    console.print(f"  Max Exposure:    {settings.max_total_exposure_pct:.0%}")
    console.print(f"  Stop Loss:       {settings.default_stop_loss_pct:.0%}")
    console.print(f"  Max Daily Trades: {settings.max_daily_trades}")
    console.print(f"  Max Order Value: ${settings.max_order_value_usd:,.0f}")
    console.print(f"  Locale:          {settings.locale}")
    console.print()


@app.command()
def version() -> None:
    """Show version information."""
    console.print(f"AI Stock Advisor (AISA) v{__version__}")


if __name__ == "__main__":
    app()
