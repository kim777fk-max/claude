"""Market data models."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from aistockadvisor.models.news import NewsArticle


class OHLCV(BaseModel):
    """Open-High-Low-Close-Volume candle."""

    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int


class Quote(BaseModel):
    """Current price quote for a symbol."""

    symbol: str
    price: Decimal
    change: Decimal = Decimal("0")
    change_pct: float = 0.0
    volume: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TickerInfo(BaseModel):
    """Basic ticker information."""

    symbol: str
    name: str = ""
    sector: str = ""
    industry: str = ""
    market_cap: Decimal | None = None
    fifty_two_week_high: Decimal | None = None
    fifty_two_week_low: Decimal | None = None
    pe_ratio: float | None = None
    dividend_yield: float | None = None


class AnalysisContext(BaseModel):
    """Bundled data for AI analysis: market data + news."""

    symbol: str
    current_price: Quote
    price_history: list[OHLCV] = []
    ticker_info: TickerInfo | None = None
    recent_news: list = []  # list[NewsArticle] - avoiding circular import
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
