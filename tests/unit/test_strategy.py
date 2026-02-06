"""Tests for trading strategies."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from aistockadvisor.ai.base import BaseAIAnalyzer
from aistockadvisor.models.analysis import AnalysisResult, Signal
from aistockadvisor.models.market import AnalysisContext, Quote
from aistockadvisor.models.order import OrderSide
from aistockadvisor.models.portfolio import AccountInfo, Position, PortfolioSnapshot
from aistockadvisor.strategy.ai_driven import AIDrivenStrategy


@pytest.fixture
def mock_analyzer():
    analyzer = AsyncMock(spec=BaseAIAnalyzer)
    return analyzer


@pytest.fixture
def context():
    return AnalysisContext(
        symbol="AAPL",
        current_price=Quote(symbol="AAPL", price=Decimal("185.00")),
    )


@pytest.fixture
def empty_portfolio():
    return PortfolioSnapshot(
        account=AccountInfo(
            cash=Decimal("100000"),
            portfolio_value=Decimal("100000"),
            buying_power=Decimal("100000"),
        ),
    )


@pytest.fixture
def portfolio_with_position():
    return PortfolioSnapshot(
        account=AccountInfo(
            cash=Decimal("90000"),
            portfolio_value=Decimal("100000"),
            buying_power=Decimal("90000"),
        ),
        positions=[
            Position(
                symbol="AAPL",
                qty=Decimal("50"),
                avg_entry_price=Decimal("180.00"),
                current_price=Decimal("185.00"),
                market_value=Decimal("9250.00"),
            )
        ],
        total_market_value=Decimal("9250"),
    )


class TestAIDrivenStrategy:
    @pytest.mark.asyncio
    async def test_buy_signal_creates_order(self, mock_analyzer, context, empty_portfolio):
        mock_analyzer.analyze_market.return_value = AnalysisResult(
            symbol="AAPL", signal=Signal.BUY, confidence=0.85,
            reasoning="Strong outlook",
        )
        strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7)
        signals = await strategy.evaluate(context, empty_portfolio)

        assert len(signals) == 1
        assert signals[0].order.side == OrderSide.BUY
        assert signals[0].order.symbol == "AAPL"

    @pytest.mark.asyncio
    async def test_low_confidence_no_signal(self, mock_analyzer, context, empty_portfolio):
        mock_analyzer.analyze_market.return_value = AnalysisResult(
            symbol="AAPL", signal=Signal.BUY, confidence=0.3,
            reasoning="Weak signal",
        )
        strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7)
        signals = await strategy.evaluate(context, empty_portfolio)

        assert len(signals) == 0

    @pytest.mark.asyncio
    async def test_hold_no_signal(self, mock_analyzer, context, empty_portfolio):
        mock_analyzer.analyze_market.return_value = AnalysisResult(
            symbol="AAPL", signal=Signal.HOLD, confidence=0.9,
        )
        strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7)
        signals = await strategy.evaluate(context, empty_portfolio)

        assert len(signals) == 0

    @pytest.mark.asyncio
    async def test_sell_with_position(self, mock_analyzer, context, portfolio_with_position):
        mock_analyzer.analyze_market.return_value = AnalysisResult(
            symbol="AAPL", signal=Signal.SELL, confidence=0.80,
        )
        strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7)
        signals = await strategy.evaluate(context, portfolio_with_position)

        assert len(signals) == 1
        assert signals[0].order.side == OrderSide.SELL
        # SELL sells half position
        assert signals[0].order.qty == Decimal("25")

    @pytest.mark.asyncio
    async def test_strong_sell_full_position(self, mock_analyzer, context, portfolio_with_position):
        mock_analyzer.analyze_market.return_value = AnalysisResult(
            symbol="AAPL", signal=Signal.STRONG_SELL, confidence=0.90,
        )
        strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7)
        signals = await strategy.evaluate(context, portfolio_with_position)

        assert len(signals) == 1
        assert signals[0].order.qty == Decimal("50")

    @pytest.mark.asyncio
    async def test_sell_without_position_no_signal(self, mock_analyzer, context, empty_portfolio):
        mock_analyzer.analyze_market.return_value = AnalysisResult(
            symbol="AAPL", signal=Signal.SELL, confidence=0.85,
        )
        strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7)
        signals = await strategy.evaluate(context, empty_portfolio)

        assert len(signals) == 0

    @pytest.mark.asyncio
    async def test_buy_when_already_holding_no_signal(
        self, mock_analyzer, context, portfolio_with_position
    ):
        mock_analyzer.analyze_market.return_value = AnalysisResult(
            symbol="AAPL", signal=Signal.BUY, confidence=0.85,
        )
        strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7)
        signals = await strategy.evaluate(context, portfolio_with_position)

        assert len(signals) == 0

    @pytest.mark.asyncio
    async def test_strong_buy_larger_position(self, mock_analyzer, context, empty_portfolio):
        mock_analyzer.analyze_market.return_value = AnalysisResult(
            symbol="AAPL", signal=Signal.STRONG_BUY, confidence=0.92,
        )
        strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7, position_size_pct=0.05)
        signals = await strategy.evaluate(context, empty_portfolio)

        assert len(signals) == 1
        # STRONG_BUY doubles the position size
        assert signals[0].order.notional == Decimal("10000.00")
