"""Rich console output formatting."""

from __future__ import annotations

from rich.console import Console
from rich.table import Table

from aistockadvisor.models.analysis import AnalysisResult, Signal
from aistockadvisor.models.portfolio import PortfolioSnapshot

console = Console()


SIGNAL_COLORS = {
    Signal.STRONG_BUY: "bold green",
    Signal.BUY: "green",
    Signal.HOLD: "yellow",
    Signal.SELL: "red",
    Signal.STRONG_SELL: "bold red",
}


def print_analysis(result: AnalysisResult) -> None:
    """Print analysis result with color-coded signal."""
    color = SIGNAL_COLORS.get(result.signal, "white")

    console.print(f"\n{'='*60}")
    console.print(f"  Analysis: [bold]{result.symbol}[/bold]")
    console.print(f"  Signal:   [{color}]{result.signal.value.upper()}[/{color}]")
    console.print(f"  Confidence: {result.confidence:.0%}")
    console.print(f"{'='*60}")

    if result.reasoning:
        console.print(f"\n[bold]Reasoning:[/bold]\n{result.reasoning}")
    if result.news_summary:
        console.print(f"\n[bold]News Impact:[/bold]\n{result.news_summary}")
    if result.market_context:
        console.print(f"\n[bold]Market Context:[/bold]\n{result.market_context}")
    console.print()


def print_portfolio(snapshot: PortfolioSnapshot) -> None:
    """Print portfolio snapshot as a formatted table."""
    console.print(f"\n[bold]Portfolio Summary[/bold]")
    console.print(f"  Cash:       ${snapshot.account.cash:,.2f}")
    console.print(f"  Value:      ${snapshot.account.portfolio_value:,.2f}")
    console.print(f"  Exposure:   {snapshot.total_exposure_pct:.1%}")
    console.print(f"  Unrealized: ${snapshot.total_unrealized_pnl:,.2f}")

    if snapshot.positions:
        table = Table(title="Positions")
        table.add_column("Symbol", style="bold")
        table.add_column("Qty", justify="right")
        table.add_column("Avg Price", justify="right")
        table.add_column("Current", justify="right")
        table.add_column("Value", justify="right")
        table.add_column("PnL", justify="right")
        table.add_column("PnL %", justify="right")

        for pos in snapshot.positions:
            pnl_color = "green" if pos.unrealized_pnl >= 0 else "red"
            table.add_row(
                pos.symbol,
                str(pos.qty),
                f"${pos.avg_entry_price:,.2f}",
                f"${pos.current_price:,.2f}",
                f"${pos.market_value:,.2f}",
                f"[{pnl_color}]${pos.unrealized_pnl:,.2f}[/{pnl_color}]",
                f"[{pnl_color}]{pos.unrealized_pnl_pct:+.1f}%[/{pnl_color}]",
            )
        console.print(table)
    else:
        console.print("  [dim]No open positions[/dim]")
    console.print()


def print_cycle_results(results: dict[str, str]) -> None:
    """Print results from a strategy cycle."""
    table = Table(title="Cycle Results")
    table.add_column("Symbol", style="bold")
    table.add_column("Action")

    for symbol, action in results.items():
        color = "green" if "buy" in action.lower() else (
            "red" if "sell" in action.lower() else "yellow"
        )
        table.add_row(symbol, f"[{color}]{action}[/{color}]")

    console.print(table)
