"""End-to-end test: full pipeline with paper broker and mock AI."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from aistockadvisor.broker.paper import PaperBroker
from aistockadvisor.config.settings import Settings
from aistockadvisor.execution.executor import TradeExecutor
from aistockadvisor.models.analysis import AnalysisResult, Signal
from aistockadvisor.models.market import AnalysisContext, Quote
from aistockadvisor.models.order import OrderSide
from aistockadvisor.portfolio.manager import PortfolioManager
from aistockadvisor.portfolio.risk import RiskManager
from aistockadvisor.strategy.ai_driven import AIDrivenStrategy


@pytest.mark.asyncio
async def test_full_buy_pipeline():
    """Test: AI says BUY -> strategy creates order -> risk approves -> broker fills."""
    # Setup
    settings = Settings(
        broker_name="paper",
        max_position_pct=0.10,
        max_order_value_usd=10000.0,
        openai_api_key="test",
    )
    broker = PaperBroker(initial_cash=100_000.0)
    risk_manager = RiskManager(settings)
    portfolio_manager = PortfolioManager(broker)

    # Mock AI analyzer
    mock_analyzer = AsyncMock()
    mock_analyzer.analyze_market.return_value = AnalysisResult(
        symbol="AAPL",
        signal=Signal.BUY,
        confidence=0.85,
        reasoning="Strong earnings beat expectations",
    )

    strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7)
    executor = TradeExecutor(broker, risk_manager, portfolio_manager)

    # Execute pipeline
    context = AnalysisContext(
        symbol="AAPL",
        current_price=Quote(symbol="AAPL", price=Decimal("185.00")),
    )
    portfolio = await portfolio_manager.get_snapshot()
    signals = await strategy.evaluate(context, portfolio)

    assert len(signals) == 1
    assert signals[0].order.side == OrderSide.BUY

    result = await executor.execute(signals[0])
    assert result.executed is True
    assert result.order is not None
    assert result.order.status == "filled"

    # Verify portfolio updated
    snapshot = await portfolio_manager.get_snapshot()
    assert len(snapshot.positions) == 1
    assert snapshot.positions[0].symbol == "AAPL"
    assert snapshot.account.cash < Decimal("100000")


@pytest.mark.asyncio
async def test_risk_rejection_pipeline():
    """Test: order exceeding limits gets rejected."""
    settings = Settings(
        broker_name="paper",
        max_order_value_usd=1000.0,  # Very low limit
        openai_api_key="test",
    )
    broker = PaperBroker(initial_cash=100_000.0)
    risk_manager = RiskManager(settings)
    portfolio_manager = PortfolioManager(broker)

    mock_analyzer = AsyncMock()
    mock_analyzer.analyze_market.return_value = AnalysisResult(
        symbol="AAPL",
        signal=Signal.STRONG_BUY,
        confidence=0.95,
        reasoning="Very strong signal",
    )

    # position_size_pct=0.05 on 100k = $5000 notional, but max_order is $1000
    strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7, position_size_pct=0.05)
    executor = TradeExecutor(broker, risk_manager, portfolio_manager)

    context = AnalysisContext(
        symbol="AAPL",
        current_price=Quote(symbol="AAPL", price=Decimal("185.00")),
    )
    portfolio = await portfolio_manager.get_snapshot()
    signals = await strategy.evaluate(context, portfolio)

    assert len(signals) == 1
    result = await executor.execute(signals[0])

    # Order should be REJECTED by risk manager
    assert result.executed is False
    assert len(result.reasons) > 0


@pytest.mark.asyncio
async def test_hold_signal_no_trade():
    """Test: HOLD signal results in no trades."""
    mock_analyzer = AsyncMock()
    mock_analyzer.analyze_market.return_value = AnalysisResult(
        symbol="AAPL",
        signal=Signal.HOLD,
        confidence=0.90,
    )

    strategy = AIDrivenStrategy(mock_analyzer, min_confidence=0.7)

    context = AnalysisContext(
        symbol="AAPL",
        current_price=Quote(symbol="AAPL", price=Decimal("185.00")),
    )
    from aistockadvisor.models.portfolio import AccountInfo, PortfolioSnapshot

    portfolio = PortfolioSnapshot(
        account=AccountInfo(
            cash=Decimal("100000"),
            portfolio_value=Decimal("100000"),
        ),
    )

    signals = await strategy.evaluate(context, portfolio)
    assert len(signals) == 0
