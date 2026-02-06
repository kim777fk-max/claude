"""Paper (simulated) broker - default safe broker requiring no API keys."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from aistockadvisor.broker.base import BaseBroker
from aistockadvisor.config.constants import DEFAULT_INITIAL_CASH
from aistockadvisor.exceptions import InsufficientFundsError, OrderRejectedError
from aistockadvisor.models.order import OrderRequest, OrderResult, OrderSide
from aistockadvisor.models.portfolio import AccountInfo, Position


class PaperBroker(BaseBroker):
    """In-memory simulated broker for testing. No external API calls needed."""

    def __init__(self, initial_cash: float = DEFAULT_INITIAL_CASH):
        self._cash = Decimal(str(initial_cash))
        self._initial_cash = Decimal(str(initial_cash))
        self._positions: dict[str, Position] = {}
        self._orders: list[OrderResult] = []

    @property
    def is_paper(self) -> bool:
        return True

    @property
    def broker_name(self) -> str:
        return "Paper Trading (Simulated)"

    async def get_account(self) -> AccountInfo:
        portfolio_value = self._cash + sum(
            p.market_value for p in self._positions.values()
        )
        return AccountInfo(
            account_id="paper-account",
            cash=self._cash,
            portfolio_value=portfolio_value,
            buying_power=self._cash,
            currency="USD",
        )

    async def submit_order(self, order: OrderRequest) -> OrderResult:
        """Simulate order execution at the specified price or estimated market price."""
        if order.qty is None and order.notional is None:
            raise OrderRejectedError("Order must specify qty or notional")

        # For paper trading, use limit_price as simulated fill price,
        # or a default placeholder price
        fill_price = order.limit_price or Decimal("100.00")

        if order.qty:
            qty = order.qty
        else:
            qty = (order.notional or Decimal("0")) / fill_price

        total_cost = qty * fill_price

        if order.side == OrderSide.BUY:
            if total_cost > self._cash:
                raise InsufficientFundsError(
                    f"Need ${total_cost} but only have ${self._cash}"
                )
            self._cash -= total_cost
            self._update_position_buy(order.symbol, qty, fill_price)
        else:
            pos = self._positions.get(order.symbol)
            if not pos or pos.qty < qty:
                raise OrderRejectedError(
                    f"Cannot sell {qty} shares of {order.symbol}: "
                    f"only have {pos.qty if pos else 0}"
                )
            self._cash += total_cost
            self._update_position_sell(order.symbol, qty)

        result = OrderResult(
            order_id=str(uuid.uuid4()),
            symbol=order.symbol,
            side=order.side,
            status="filled",
            filled_qty=qty,
            filled_avg_price=fill_price,
            submitted_at=datetime.now(timezone.utc),
        )
        self._orders.append(result)
        return result

    def _update_position_buy(
        self, symbol: str, qty: Decimal, price: Decimal
    ) -> None:
        if symbol in self._positions:
            pos = self._positions[symbol]
            total_cost = pos.qty * pos.avg_entry_price + qty * price
            new_qty = pos.qty + qty
            pos.avg_entry_price = total_cost / new_qty
            pos.qty = new_qty
            pos.update_price(price)
        else:
            pos = Position(
                symbol=symbol,
                qty=qty,
                avg_entry_price=price,
                current_price=price,
                market_value=qty * price,
            )
            self._positions[symbol] = pos

    def _update_position_sell(self, symbol: str, qty: Decimal) -> None:
        pos = self._positions[symbol]
        pos.qty -= qty
        if pos.qty <= 0:
            del self._positions[symbol]
        else:
            pos.market_value = pos.qty * pos.current_price

    async def cancel_order(self, order_id: str) -> bool:
        return False  # Paper orders fill instantly

    async def get_positions(self) -> list[Position]:
        return list(self._positions.values())

    async def get_position(self, symbol: str) -> Position | None:
        return self._positions.get(symbol)

    async def close_position(self, symbol: str) -> OrderResult:
        pos = self._positions.get(symbol)
        if not pos:
            raise OrderRejectedError(f"No position in {symbol}")
        order = OrderRequest(
            symbol=symbol,
            side=OrderSide.SELL,
            qty=pos.qty,
            limit_price=pos.current_price,
        )
        return await self.submit_order(order)

    async def close_all_positions(self) -> list[OrderResult]:
        results = []
        for symbol in list(self._positions.keys()):
            results.append(await self.close_position(symbol))
        return results
