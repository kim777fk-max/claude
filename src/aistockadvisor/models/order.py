"""Order models."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderRequest(BaseModel):
    """A request to place an order."""

    symbol: str
    side: OrderSide
    order_type: OrderType = OrderType.MARKET
    qty: Decimal | None = None
    notional: Decimal | None = None
    limit_price: Decimal | None = None
    stop_price: Decimal | None = None
    time_in_force: str = "day"


class OrderResult(BaseModel):
    """Result of a submitted order."""

    order_id: str
    symbol: str
    side: OrderSide
    status: str
    filled_qty: Decimal | None = None
    filled_avg_price: Decimal | None = None
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
