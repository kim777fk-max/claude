"""Tests for data models."""

from decimal import Decimal

import pytest

from aistockadvisor.models.analysis import AnalysisResult, Signal
from aistockadvisor.models.market import OHLCV, Quote, TickerInfo
from aistockadvisor.models.order import OrderRequest, OrderSide, OrderType
from aistockadvisor.models.portfolio import AccountInfo, Position, PortfolioSnapshot


class TestQuote:
    def test_create_quote(self):
        q = Quote(symbol="AAPL", price=Decimal("185.50"))
        assert q.symbol == "AAPL"
        assert q.price == Decimal("185.50")
        assert q.change == Decimal("0")

    def test_quote_with_change(self):
        q = Quote(
            symbol="MSFT",
            price=Decimal("400.00"),
            change=Decimal("5.00"),
            change_pct=1.27,
        )
        assert q.change_pct == 1.27


class TestOrderRequest:
    def test_market_buy(self):
        order = OrderRequest(
            symbol="AAPL",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            qty=Decimal("10"),
        )
        assert order.side == OrderSide.BUY
        assert order.order_type == OrderType.MARKET

    def test_limit_sell(self):
        order = OrderRequest(
            symbol="AAPL",
            side=OrderSide.SELL,
            order_type=OrderType.LIMIT,
            qty=Decimal("5"),
            limit_price=Decimal("190.00"),
        )
        assert order.limit_price == Decimal("190.00")


class TestPosition:
    def test_update_price(self):
        pos = Position(
            symbol="AAPL",
            qty=Decimal("10"),
            avg_entry_price=Decimal("180.00"),
        )
        pos.update_price(Decimal("190.00"))
        assert pos.market_value == Decimal("1900.00")
        assert pos.unrealized_pnl == Decimal("100.00")
        assert pos.unrealized_pnl_pct == pytest.approx(5.555, rel=0.01)

    def test_update_price_loss(self):
        pos = Position(
            symbol="AAPL",
            qty=Decimal("10"),
            avg_entry_price=Decimal("200.00"),
        )
        pos.update_price(Decimal("190.00"))
        assert pos.unrealized_pnl == Decimal("-100.00")


class TestPortfolioSnapshot:
    def test_exposure_pct(self):
        snapshot = PortfolioSnapshot(
            account=AccountInfo(
                cash=Decimal("50000"),
                portfolio_value=Decimal("100000"),
            ),
            total_market_value=Decimal("50000"),
        )
        assert snapshot.total_exposure_pct == 0.5

    def test_zero_portfolio_exposure(self):
        snapshot = PortfolioSnapshot(
            account=AccountInfo(portfolio_value=Decimal("0")),
        )
        assert snapshot.total_exposure_pct == 0.0


class TestAnalysisResult:
    def test_signal_values(self):
        assert Signal.STRONG_BUY.value == "strong_buy"
        assert Signal.HOLD.value == "hold"
        assert Signal.STRONG_SELL.value == "strong_sell"

    def test_confidence_bounds(self):
        # Valid confidence
        result = AnalysisResult(
            symbol="AAPL", signal=Signal.BUY, confidence=0.85
        )
        assert result.confidence == 0.85

        # Boundary values
        AnalysisResult(symbol="X", signal=Signal.HOLD, confidence=0.0)
        AnalysisResult(symbol="X", signal=Signal.HOLD, confidence=1.0)

        # Invalid confidence
        with pytest.raises(Exception):
            AnalysisResult(symbol="X", signal=Signal.HOLD, confidence=1.5)
