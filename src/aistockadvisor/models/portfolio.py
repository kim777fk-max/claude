"""Portfolio and account models."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from pydantic import BaseModel, Field


class AccountInfo(BaseModel):
    """Broker account information."""

    account_id: str = ""
    cash: Decimal = Decimal("0")
    portfolio_value: Decimal = Decimal("0")
    buying_power: Decimal = Decimal("0")
    currency: str = "USD"


class Position(BaseModel):
    """A single stock position."""

    symbol: str
    qty: Decimal
    avg_entry_price: Decimal
    current_price: Decimal = Decimal("0")
    market_value: Decimal = Decimal("0")
    unrealized_pnl: Decimal = Decimal("0")
    unrealized_pnl_pct: float = 0.0

    def update_price(self, price: Decimal) -> None:
        """Recalculate values based on current price."""
        self.current_price = price
        self.market_value = self.qty * price
        cost_basis = self.qty * self.avg_entry_price
        self.unrealized_pnl = self.market_value - cost_basis
        if cost_basis > 0:
            self.unrealized_pnl_pct = float(self.unrealized_pnl / cost_basis) * 100


class PortfolioSnapshot(BaseModel):
    """Snapshot of the full portfolio at a point in time."""

    account: AccountInfo
    positions: list[Position] = []
    total_market_value: Decimal = Decimal("0")
    total_unrealized_pnl: Decimal = Decimal("0")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def total_exposure_pct(self) -> float:
        """Percentage of portfolio value in positions."""
        if self.account.portfolio_value == 0:
            return 0.0
        return float(self.total_market_value / self.account.portfolio_value)
