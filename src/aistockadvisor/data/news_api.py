"""News data provider using NewsAPI.org or httpx-based fetching."""

from __future__ import annotations

from datetime import date, datetime, timezone

import httpx

from aistockadvisor.data.base import NewsDataProvider
from aistockadvisor.exceptions import DataFetchError
from aistockadvisor.models.news import NewsArticle


class NewsAPIProvider(NewsDataProvider):
    """News provider using NewsAPI.org."""

    BASE_URL = "https://newsapi.org/v2"

    def __init__(self, api_key: str):
        self._api_key = api_key
        self._client = httpx.AsyncClient(timeout=30.0)

    async def get_news(
        self,
        query: str,
        from_date: date | None = None,
        to_date: date | None = None,
        language: str = "en",
    ) -> list[NewsArticle]:
        """Search news articles."""
        params: dict[str, str] = {
            "q": query,
            "language": language,
            "sortBy": "publishedAt",
            "pageSize": "20",
            "apiKey": self._api_key,
        }
        if from_date:
            params["from"] = from_date.isoformat()
        if to_date:
            params["to"] = to_date.isoformat()

        try:
            resp = await self._client.get(f"{self.BASE_URL}/everything", params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            raise DataFetchError(f"Failed to fetch news: {e}") from e

        articles = []
        for item in data.get("articles", []):
            published = item.get("publishedAt", "")
            try:
                pub_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                pub_dt = datetime.now(timezone.utc)

            articles.append(
                NewsArticle(
                    title=item.get("title", ""),
                    description=item.get("description", "") or "",
                    source=item.get("source", {}).get("name", ""),
                    url=item.get("url", ""),
                    published_at=pub_dt,
                    content=item.get("content", "") or "",
                )
            )
        return articles

    async def get_market_news(
        self, symbols: list[str] | None = None
    ) -> list[NewsArticle]:
        """Get market news, optionally filtered by stock symbols."""
        if symbols:
            query = " OR ".join(symbols) + " stock market"
        else:
            query = "stock market economy"
        return await self.get_news(query)

    async def close(self) -> None:
        await self._client.aclose()
