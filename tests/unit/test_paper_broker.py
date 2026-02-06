"""Tests for PaperBroker."""

from decimal import Decimal

import pytest

from aistockadvisor.broker.paper import PaperBroker
from aistockadvisor.exceptions import InsufficientFundsError, OrderRejectedError
from aistockadvisor.models.order import OrderRequest, OrderSide, OrderType


@pytest.fixture
def broker():
    return PaperBroker(initial_cash=100_000.0)


class TestPaperBroker:
    @pytest.mark.asyncio
    async def test_is_paper(self, broker):
        assert broker.is_paper is True
        assert "Paper" in broker.broker_name

    @pytest.mark.asyncio
    async def test_initial_account(self, broker):
        account = await broker.get_account()
        assert account.cash == Decimal("100000")
        assert account.portfolio_value == Decimal("100000")

    @pytest.mark.asyncio
    async def test_buy_order(self, broker):
        order = OrderRequest(
            symbol="AAPL",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            qty=Decimal("10"),
            limit_price=Decimal("150.00"),
        )
        result = await broker.submit_order(order)

        assert result.status == "filled"
        assert result.filled_qty == Decimal("10")
        assert result.filled_avg_price == Decimal("150.00")
        assert result.symbol == "AAPL"

        # Check cash deducted
        account = await broker.get_account()
        assert account.cash == Decimal("98500.00")

        # Check position created
        positions = await broker.get_positions()
        assert len(positions) == 1
        assert positions[0].symbol == "AAPL"
        assert positions[0].qty == Decimal("10")

    @pytest.mark.asyncio
    async def test_sell_order(self, broker):
        # Buy first
        buy = OrderRequest(
            symbol="AAPL", side=OrderSide.BUY,
            qty=Decimal("10"), limit_price=Decimal("150.00"),
        )
        await broker.submit_order(buy)

        # Sell
        sell = OrderRequest(
            symbol="AAPL", side=OrderSide.SELL,
            qty=Decimal("5"), limit_price=Decimal("160.00"),
        )
        result = await broker.submit_order(sell)

        assert result.status == "filled"
        assert result.filled_qty == Decimal("5")

        pos = await broker.get_position("AAPL")
        assert pos is not None
        assert pos.qty == Decimal("5")

    @pytest.mark.asyncio
    async def test_insufficient_funds(self, broker):
        order = OrderRequest(
            symbol="AAPL", side=OrderSide.BUY,
            qty=Decimal("10000"), limit_price=Decimal("150.00"),
        )
        with pytest.raises(InsufficientFundsError):
            await broker.submit_order(order)

    @pytest.mark.asyncio
    async def test_sell_without_position(self, broker):
        order = OrderRequest(
            symbol="AAPL", side=OrderSide.SELL,
            qty=Decimal("10"), limit_price=Decimal("150.00"),
        )
        with pytest.raises(OrderRejectedError):
            await broker.submit_order(order)

    @pytest.mark.asyncio
    async def test_close_position(self, broker):
        buy = OrderRequest(
            symbol="AAPL", side=OrderSide.BUY,
            qty=Decimal("10"), limit_price=Decimal("150.00"),
        )
        await broker.submit_order(buy)

        result = await broker.close_position("AAPL")
        assert result.status == "filled"

        positions = await broker.get_positions()
        assert len(positions) == 0

    @pytest.mark.asyncio
    async def test_close_all_positions(self, broker):
        for symbol in ["AAPL", "MSFT"]:
            buy = OrderRequest(
                symbol=symbol, side=OrderSide.BUY,
                qty=Decimal("5"), limit_price=Decimal("100.00"),
            )
            await broker.submit_order(buy)

        results = await broker.close_all_positions()
        assert len(results) == 2

        positions = await broker.get_positions()
        assert len(positions) == 0

    @pytest.mark.asyncio
    async def test_no_qty_or_notional_rejected(self, broker):
        order = OrderRequest(symbol="AAPL", side=OrderSide.BUY)
        with pytest.raises(OrderRejectedError):
            await broker.submit_order(order)

    @pytest.mark.asyncio
    async def test_buy_with_notional(self, broker):
        order = OrderRequest(
            symbol="AAPL", side=OrderSide.BUY,
            notional=Decimal("1500.00"),
            limit_price=Decimal("150.00"),
        )
        result = await broker.submit_order(order)
        assert result.filled_qty == Decimal("10")  # 1500 / 150 = 10

    @pytest.mark.asyncio
    async def test_multiple_buys_average_cost(self, broker):
        # Buy 10 @ 100
        await broker.submit_order(OrderRequest(
            symbol="AAPL", side=OrderSide.BUY,
            qty=Decimal("10"), limit_price=Decimal("100.00"),
        ))
        # Buy 10 @ 200
        await broker.submit_order(OrderRequest(
            symbol="AAPL", side=OrderSide.BUY,
            qty=Decimal("10"), limit_price=Decimal("200.00"),
        ))

        pos = await broker.get_position("AAPL")
        assert pos is not None
        assert pos.qty == Decimal("20")
        assert pos.avg_entry_price == Decimal("150")  # (1000 + 2000) / 20
