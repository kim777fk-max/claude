"""Strategy engine - orchestrates the full analysis-to-execution pipeline."""

from __future__ import annotations

import logging

from aistockadvisor.data.aggregator import DataAggregator
from aistockadvisor.execution.executor import TradeExecutor
from aistockadvisor.portfolio.manager import PortfolioManager
from aistockadvisor.strategy.base import BaseStrategy

logger = logging.getLogger(__name__)


class StrategyEngine:
    """Orchestrates: data fetch -> AI analysis -> strategy -> execution."""

    def __init__(
        self,
        aggregator: DataAggregator,
        strategy: BaseStrategy,
        executor: TradeExecutor,
        portfolio_manager: PortfolioManager,
        watchlist: list[str],
    ):
        self._aggregator = aggregator
        self._strategy = strategy
        self._executor = executor
        self._portfolio = portfolio_manager
        self._watchlist = watchlist

    async def run_cycle(self) -> dict[str, str]:
        """Run one full analysis-and-trade cycle for all watched symbols.

        Returns a dict of symbol -> action taken.
        """
        results: dict[str, str] = {}

        portfolio = await self._portfolio.get_snapshot()
        logger.info(
            "Starting analysis cycle. Portfolio value: $%s, Cash: $%s",
            portfolio.account.portfolio_value,
            portfolio.account.cash,
        )

        for symbol in self._watchlist:
            try:
                logger.info("Analyzing %s...", symbol)
                context = await self._aggregator.get_analysis_context(symbol)
                signals = await self._strategy.evaluate(context, portfolio)

                if not signals:
                    results[symbol] = "hold (no action)"
                    continue

                for signal in signals:
                    exec_result = await self._executor.execute(signal)
                    if exec_result.executed:
                        results[symbol] = (
                            f"{signal.order.side.value} "
                            f"(signal={signal.analysis.signal.value}, "
                            f"confidence={signal.analysis.confidence:.2f})"
                        )
                    else:
                        results[symbol] = (
                            f"rejected: {', '.join(exec_result.reasons)}"
                        )

                # Refresh portfolio after each trade
                portfolio = await self._portfolio.get_snapshot()

            except Exception as e:
                logger.error("Error analyzing %s: %s", symbol, e)
                results[symbol] = f"error: {e}"

        return results
