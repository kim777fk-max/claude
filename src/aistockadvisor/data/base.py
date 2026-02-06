"""Abstract interfaces for data providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

from aistockadvisor.models.market import OHLCV, Quote, TickerInfo
from aistockadvisor.models.news import NewsArticle


class MarketDataProvider(ABC):
    """Abstract interface for market data sources."""

    @abstractmethod
    async def get_current_price(self, symbol: str) -> Quote:
        """Get current price quote for a symbol."""
        ...

    @abstractmethod
    async def get_history(
        self, symbol: str, period: str = "3mo", interval: str = "1d"
    ) -> list[OHLCV]:
        """Get historical OHLCV data."""
        ...

    @abstractmethod
    async def get_ticker_info(self, symbol: str) -> TickerInfo:
        """Get basic ticker information."""
        ...


class NewsDataProvider(ABC):
    """Abstract interface for news data sources."""

    @abstractmethod
    async def get_news(
        self,
        query: str,
        from_date: date | None = None,
        to_date: date | None = None,
        language: str = "en",
    ) -> list[NewsArticle]:
        """Search for news articles by query."""
        ...

    @abstractmethod
    async def get_market_news(
        self, symbols: list[str] | None = None
    ) -> list[NewsArticle]:
        """Get market-related news, optionally filtered by symbols."""
        ...
