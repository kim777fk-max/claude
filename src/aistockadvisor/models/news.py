"""News data models."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field


class NewsArticle(BaseModel):
    """A single news article."""

    title: str
    description: str = ""
    source: str = ""
    url: str = ""
    published_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    content: str = ""
    sentiment: float | None = None  # -1.0 to 1.0 if pre-analyzed
