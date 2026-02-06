"""AI-driven trading strategy."""

from __future__ import annotations

import logging
from decimal import Decimal

from aistockadvisor.ai.base import BaseAIAnalyzer
from aistockadvisor.config.constants import MIN_CONFIDENCE_THRESHOLD
from aistockadvisor.models.analysis import AnalysisResult, Signal, TradeSignal
from aistockadvisor.models.market import AnalysisContext
from aistockadvisor.models.order import OrderRequest, OrderSide, OrderType
from aistockadvisor.models.portfolio import PortfolioSnapshot
from aistockadvisor.strategy.base import BaseStrategy

logger = logging.getLogger(__name__)


class AIDrivenStrategy(BaseStrategy):
    """Strategy that uses AI analysis to generate trade signals."""

    def __init__(
        self,
        analyzer: BaseAIAnalyzer,
        min_confidence: float = MIN_CONFIDENCE_THRESHOLD,
        position_size_pct: float = 0.05,
    ):
        self._analyzer = analyzer
        self._min_confidence = min_confidence
        self._position_size_pct = position_size_pct

    async def evaluate(
        self, context: AnalysisContext, portfolio: PortfolioSnapshot
    ) -> list[TradeSignal]:
        """Run AI analysis and convert to trade signals."""
        result = await self._analyzer.analyze_market(context)

        logger.info(
            "AI analysis for %s: signal=%s confidence=%.2f",
            context.symbol,
            result.signal.value,
            result.confidence,
        )

        if result.confidence < self._min_confidence:
            logger.info(
                "Skipping %s: confidence %.2f below threshold %.2f",
                context.symbol,
                result.confidence,
                self._min_confidence,
            )
            return []

        order = self._signal_to_order(result, context, portfolio)
        if order is None:
            return []

        return [TradeSignal(analysis=result, order=order)]

    def _signal_to_order(
        self,
        result: AnalysisResult,
        context: AnalysisContext,
        portfolio: PortfolioSnapshot,
    ) -> OrderRequest | None:
        """Convert an analysis result into a concrete order."""
        symbol = context.symbol
        price = context.current_price.price

        # Check if we already have a position
        existing_pos = None
        for pos in portfolio.positions:
            if pos.symbol == symbol:
                existing_pos = pos
                break

        if result.signal in (Signal.STRONG_BUY, Signal.BUY):
            if existing_pos:
                logger.info("Already have position in %s, skipping buy", symbol)
                return None

            # Calculate position size as percentage of portfolio value
            available = float(portfolio.account.cash)
            size_factor = (
                self._position_size_pct * 2
                if result.signal == Signal.STRONG_BUY
                else self._position_size_pct
            )
            notional = Decimal(str(round(available * size_factor, 2)))

            if notional < 1:
                return None

            return OrderRequest(
                symbol=symbol,
                side=OrderSide.BUY,
                order_type=OrderType.MARKET,
                notional=notional,
            )

        elif result.signal in (Signal.STRONG_SELL, Signal.SELL):
            if not existing_pos:
                logger.info("No position in %s to sell", symbol)
                return None

            # Sell entire position on strong_sell, half on sell
            qty = (
                existing_pos.qty
                if result.signal == Signal.STRONG_SELL
                else existing_pos.qty / 2
            )

            return OrderRequest(
                symbol=symbol,
                side=OrderSide.SELL,
                order_type=OrderType.MARKET,
                qty=qty,
            )

        # HOLD - no action
        return None
