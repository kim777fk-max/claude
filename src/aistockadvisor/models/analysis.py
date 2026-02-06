"""AI analysis result models."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field

from aistockadvisor.models.order import OrderRequest


class Signal(str, Enum):
    STRONG_BUY = "strong_buy"
    BUY = "buy"
    HOLD = "hold"
    SELL = "sell"
    STRONG_SELL = "strong_sell"


class AnalysisResult(BaseModel):
    """Result of AI market analysis."""

    symbol: str
    signal: Signal
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = ""
    news_summary: str = ""
    market_context: str = ""
    analyzed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TradeSignal(BaseModel):
    """A concrete trade signal derived from analysis."""

    analysis: AnalysisResult
    order: OrderRequest
    priority: int = 0
