"""Abstract strategy interface."""

from __future__ import annotations

from abc import ABC, abstractmethod

from aistockadvisor.models.analysis import TradeSignal
from aistockadvisor.models.market import AnalysisContext
from aistockadvisor.models.portfolio import PortfolioSnapshot


class BaseStrategy(ABC):
    """Abstract base class for trading strategies."""

    @abstractmethod
    async def evaluate(
        self, context: AnalysisContext, portfolio: PortfolioSnapshot
    ) -> list[TradeSignal]:
        """Evaluate market conditions and return trade signals."""
        ...
