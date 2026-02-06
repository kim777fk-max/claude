"""Anthropic Claude-based market analyzer."""

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


class AnthropicAnalyzer(BaseAIAnalyzer):
    """Market analyzer using Anthropic Claude API."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        try:
            from anthropic import AsyncAnthropic

            self._client = AsyncAnthropic(api_key=api_key)
        except ImportError:
            raise AIAnalysisError("anthropic package required: pip install anthropic")
        self._model = model

    async def analyze_market(self, context: AnalysisContext) -> AnalysisResult:
        """Analyze market using Anthropic Claude."""
        messages = build_market_analysis_messages(context)

        # Extract system message (Anthropic uses separate system parameter)
        system_msg = ""
        user_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
            else:
                user_messages.append(msg)

        try:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=2000,
                system=system_msg,
                messages=user_messages,  # type: ignore[arg-type]
                temperature=0.3,
            )
            content = response.content[0].text
            # Extract JSON from response (Claude may wrap it in markdown)
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            data = json.loads(content.strip())
        except json.JSONDecodeError as e:
            raise AIAnalysisError(f"Failed to parse AI response as JSON: {e}") from e
        except Exception as e:
            raise AIAnalysisError(f"Anthropic API call failed: {e}") from e

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
        """Generate portfolio review using Anthropic Claude."""
        portfolio_text = self._format_portfolio(portfolio)
        messages = build_portfolio_review_messages(portfolio_text)

        system_msg = ""
        user_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_msg = msg["content"]
            else:
                user_messages.append(msg)

        try:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=2000,
                system=system_msg,
                messages=user_messages,  # type: ignore[arg-type]
                temperature=0.5,
            )
            return response.content[0].text
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
