"""Portfolio manager - tracks positions and calculates PnL."""

from __future__ import annotations

from decimal import Decimal

from aistockadvisor.broker.base import BaseBroker
from aistockadvisor.models.order import OrderResult
from aistockadvisor.models.portfolio import PortfolioSnapshot


class PortfolioManager:
    """Manages portfolio state via the broker."""

    def __init__(self, broker: BaseBroker):
        self._broker = broker
        self._trade_history: list[OrderResult] = []

    async def get_snapshot(self) -> PortfolioSnapshot:
        """Get current portfolio snapshot from the broker."""
        account = await self._broker.get_account()
        positions = await self._broker.get_positions()

        total_market_value = sum(p.market_value for p in positions)
        total_unrealized_pnl = sum(p.unrealized_pnl for p in positions)

        return PortfolioSnapshot(
            account=account,
            positions=positions,
            total_market_value=total_market_value,
            total_unrealized_pnl=total_unrealized_pnl,
        )

    async def record_trade(self, order: OrderResult) -> None:
        """Record a completed trade."""
        self._trade_history.append(order)

    @property
    def trade_history(self) -> list[OrderResult]:
        return list(self._trade_history)

    @property
    def total_trades(self) -> int:
        return len(self._trade_history)
