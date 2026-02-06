"""Yahoo Finance market data provider using yfinance."""

from __future__ import annotations

import asyncio
from decimal import Decimal

import yfinance as yf

from aistockadvisor.data.base import MarketDataProvider
from aistockadvisor.exceptions import DataFetchError
from aistockadvisor.models.market import OHLCV, Quote, TickerInfo


class YahooMarketData(MarketDataProvider):
    """Market data provider using Yahoo Finance (yfinance)."""

    async def get_current_price(self, symbol: str) -> Quote:
        """Get current price from Yahoo Finance."""
        try:
            ticker = await asyncio.to_thread(yf.Ticker, symbol)
            info = await asyncio.to_thread(lambda: ticker.info)

            price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
            prev_close = info.get("previousClose", price)
            change = price - prev_close if prev_close else 0
            change_pct = (change / prev_close * 100) if prev_close else 0

            return Quote(
                symbol=symbol,
                price=Decimal(str(price)),
                change=Decimal(str(round(change, 2))),
                change_pct=round(change_pct, 2),
                volume=info.get("volume", 0) or 0,
            )
        except Exception as e:
            raise DataFetchError(f"Failed to fetch price for {symbol}: {e}") from e

    async def get_history(
        self, symbol: str, period: str = "3mo", interval: str = "1d"
    ) -> list[OHLCV]:
        """Get historical OHLCV data from Yahoo Finance."""
        try:
            ticker = yf.Ticker(symbol)
            df = await asyncio.to_thread(
                ticker.history, period=period, interval=interval
            )

            candles = []
            for timestamp, row in df.iterrows():
                candles.append(
                    OHLCV(
                        timestamp=timestamp.to_pydatetime(),
                        open=Decimal(str(round(row["Open"], 2))),
                        high=Decimal(str(round(row["High"], 2))),
                        low=Decimal(str(round(row["Low"], 2))),
                        close=Decimal(str(round(row["Close"], 2))),
                        volume=int(row["Volume"]),
                    )
                )
            return candles
        except Exception as e:
            raise DataFetchError(f"Failed to fetch history for {symbol}: {e}") from e

    async def get_ticker_info(self, symbol: str) -> TickerInfo:
        """Get ticker information from Yahoo Finance."""
        try:
            ticker = yf.Ticker(symbol)
            info = await asyncio.to_thread(lambda: ticker.info)

            return TickerInfo(
                symbol=symbol,
                name=info.get("shortName", ""),
                sector=info.get("sector", ""),
                industry=info.get("industry", ""),
                market_cap=Decimal(str(info["marketCap"])) if info.get("marketCap") else None,
                fifty_two_week_high=(
                    Decimal(str(info["fiftyTwoWeekHigh"]))
                    if info.get("fiftyTwoWeekHigh")
                    else None
                ),
                fifty_two_week_low=(
                    Decimal(str(info["fiftyTwoWeekLow"]))
                    if info.get("fiftyTwoWeekLow")
                    else None
                ),
                pe_ratio=info.get("trailingPE"),
                dividend_yield=info.get("dividendYield"),
            )
        except Exception as e:
            raise DataFetchError(f"Failed to fetch ticker info for {symbol}: {e}") from e
