"""Data aggregator - combines market data and news into unified analysis context."""

from __future__ import annotations

import asyncio
import logging

from aistockadvisor.data.base import MarketDataProvider, NewsDataProvider
from aistockadvisor.models.market import AnalysisContext

logger = logging.getLogger(__name__)


class DataAggregator:
    """Combines market data and news data into a unified feed for AI analysis."""

    def __init__(
        self,
        market: MarketDataProvider,
        news: NewsDataProvider | None = None,
    ):
        self._market = market
        self._news = news

    async def get_analysis_context(self, symbol: str) -> AnalysisContext:
        """Fetch all available data for a symbol bundled for analysis."""
        # Fetch market data concurrently
        tasks = [
            self._market.get_current_price(symbol),
            self._market.get_history(symbol, period="3mo"),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        price = results[0] if not isinstance(results[0], Exception) else None
        history = results[1] if not isinstance(results[1], Exception) else []

        if price is None:
            raise results[0]  # type: ignore[misc]

        # Fetch news separately (optional)
        news_articles = []
        if self._news:
            try:
                news_articles = await self._news.get_market_news(symbols=[symbol])
            except Exception as e:
                logger.warning("Failed to fetch news for %s: %s", symbol, e)

        # Try to get ticker info
        ticker_info = None
        try:
            ticker_info = await self._market.get_ticker_info(symbol)
        except Exception as e:
            logger.warning("Failed to fetch ticker info for %s: %s", symbol, e)

        return AnalysisContext(
            symbol=symbol,
            current_price=price,
            price_history=history if isinstance(history, list) else [],
            ticker_info=ticker_info,
            recent_news=news_articles,
        )
