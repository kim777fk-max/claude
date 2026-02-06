"""Tests for risk management."""

from decimal import Decimal

import pytest

from aistockadvisor.config.settings import Settings
from aistockadvisor.models.order import OrderRequest, OrderSide
from aistockadvisor.models.portfolio import AccountInfo, PortfolioSnapshot
from aistockadvisor.portfolio.risk import RiskManager


@pytest.fixture
def risk_manager(settings):
    return RiskManager(settings)


@pytest.fixture
def portfolio():
    return PortfolioSnapshot(
        account=AccountInfo(
            cash=Decimal("80000"),
            portfolio_value=Decimal("100000"),
            buying_power=Decimal("80000"),
        ),
        total_market_value=Decimal("20000"),
    )


class TestRiskManager:
    def test_approve_normal_order(self, risk_manager, portfolio):
        order = OrderRequest(
            symbol="AAPL",
            side=OrderSide.BUY,
            notional=Decimal("5000"),
        )
        result = risk_manager.validate_order(order, portfolio)
        assert result.approved is True

    def test_reject_over_max_order_value(self, risk_manager, portfolio):
        order = OrderRequest(
            symbol="AAPL",
            side=OrderSide.BUY,
            notional=Decimal("15000"),  # Exceeds 10000 limit
        )
        result = risk_manager.validate_order(order, portfolio)
        assert result.approved is False
        assert any("Order value" in r for r in result.reasons)

    def test_reject_over_position_limit(self, risk_manager, portfolio):
        """An order that would be >10% of portfolio should be rejected."""
        # Create a settings with tight limit and small portfolio
        settings = Settings(
            max_position_pct=0.05,
            max_order_value_usd=100000.0,
            openai_api_key="test",
        )
        rm = RiskManager(settings)
        order = OrderRequest(
            symbol="AAPL",
            side=OrderSide.BUY,
            notional=Decimal("8000"),  # 8% of 100k
        )
        result = rm.validate_order(order, portfolio)
        assert result.approved is False
        assert any("Position" in r for r in result.reasons)

    def test_daily_trade_limit(self, risk_manager, portfolio):
        order = OrderRequest(
            symbol="AAPL",
            side=OrderSide.BUY,
            notional=Decimal("1000"),
        )
        # Exhaust daily limit
        for _ in range(10):
            risk_manager.record_trade()

        result = risk_manager.validate_order(order, portfolio)
        assert result.approved is False
        assert any("Daily trade limit" in r for r in result.reasons)

    def test_reset_daily_count(self, risk_manager, portfolio):
        for _ in range(10):
            risk_manager.record_trade()
        risk_manager.reset_daily_count()

        order = OrderRequest(
            symbol="AAPL",
            side=OrderSide.BUY,
            notional=Decimal("1000"),
        )
        result = risk_manager.validate_order(order, portfolio)
        assert result.approved is True

    def test_sell_orders_skip_position_check(self, risk_manager, portfolio):
        """Sell orders should not be blocked by position/exposure limits."""
        order = OrderRequest(
            symbol="AAPL",
            side=OrderSide.SELL,
            qty=Decimal("10"),
            limit_price=Decimal("150"),
        )
        result = risk_manager.validate_order(order, portfolio)
        assert result.approved is True

    def test_stop_loss_calculation(self, risk_manager):
        # Buy side: stop loss below entry
        stop = risk_manager.calculate_stop_loss(Decimal("100"), OrderSide.BUY)
        assert stop == Decimal("95.00")

        # Sell side: stop loss above entry
        stop = risk_manager.calculate_stop_loss(Decimal("100"), OrderSide.SELL)
        assert stop == Decimal("105.00")
