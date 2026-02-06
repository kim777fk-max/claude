"""Abstract AI analyzer interface."""

from __future__ import annotations

from abc import ABC, abstractmethod

from aistockadvisor.models.analysis import AnalysisResult
from aistockadvisor.models.market import AnalysisContext
from aistockadvisor.models.portfolio import PortfolioSnapshot


class BaseAIAnalyzer(ABC):
    """Abstract interface for AI-powered market analysis."""

    @abstractmethod
    async def analyze_market(self, context: AnalysisContext) -> AnalysisResult:
        """Analyze market data + news and produce an investment signal."""
        ...

    @abstractmethod
    async def generate_portfolio_review(
        self, portfolio: PortfolioSnapshot
    ) -> str:
        """Generate a natural-language portfolio review."""
        ...
