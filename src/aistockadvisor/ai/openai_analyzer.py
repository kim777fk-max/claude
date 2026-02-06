"""OpenAI-based market analyzer."""

from __future__ import annotations

import json
import logging

from aistockadvisor.ai.base import BaseAIAnalyzer
from aistockadvisor.ai.prompts.market_analysis import (
    build_market_analysis_messages,
    build_portfolio_review_messages,
)
from aistockadvisor.exceptions import AIAnalysisError
from aistockadvisor.models.analysis import AnalysisResult, Signal
from aistockadvisor.models.market import AnalysisContext
from aistockadvisor.models.portfolio import PortfolioSnapshot

logger = logging.getLogger(__name__)


class OpenAIAnalyzer(BaseAIAnalyzer):
    """Market analyzer using OpenAI API."""

    def __init__(self, api_key: str, model: str = "gpt-4o"):
        try:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(api_key=api_key)
        except ImportError:
            raise AIAnalysisError("openai package required: pip install openai")
        self._model = model

    async def analyze_market(self, context: AnalysisContext) -> AnalysisResult:
        """Analyze market using OpenAI."""
        messages = build_market_analysis_messages(context)

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,  # type: ignore[arg-type]
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content or "{}"
            data = json.loads(content)
        except json.JSONDecodeError as e:
            raise AIAnalysisError(f"Failed to parse AI response as JSON: {e}") from e
        except Exception as e:
            raise AIAnalysisError(f"OpenAI API call failed: {e}") from e

        try:
            signal = Signal(data.get("signal", "hold"))
        except ValueError:
            signal = Signal.HOLD

        return AnalysisResult(
            symbol=context.symbol,
            signal=signal,
            confidence=min(max(float(data.get("confidence", 0.5)), 0.0), 1.0),
            reasoning=data.get("reasoning", ""),
            news_summary=data.get("news_summary", ""),
            market_context=data.get("market_context", ""),
        )

    async def generate_portfolio_review(self, portfolio: PortfolioSnapshot) -> str:
        """Generate portfolio review using OpenAI."""
        portfolio_text = self._format_portfolio(portfolio)
        messages = build_portfolio_review_messages(portfolio_text)

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,  # type: ignore[arg-type]
                temperature=0.5,
            )
            return response.choices[0].message.content or "Unable to generate review."
        except Exception as e:
            raise AIAnalysisError(f"Portfolio review failed: {e}") from e

    @staticmethod
    def _format_portfolio(portfolio: PortfolioSnapshot) -> str:
        lines = [
            f"Cash: ${portfolio.account.cash}",
            f"Total Value: ${portfolio.account.portfolio_value}",
            f"Exposure: {portfolio.total_exposure_pct:.1%}",
            "",
            "Positions:",
        ]
        for pos in portfolio.positions:
            lines.append(
                f"  {pos.symbol}: {pos.qty} shares @ ${pos.avg_entry_price} "
                f"(current: ${pos.current_price}, PnL: ${pos.unrealized_pnl})"
            )
        if not portfolio.positions:
            lines.append("  No open positions")
        return "\n".join(lines)
