"""Trade executor - validates through risk management and executes via broker."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from aistockadvisor.broker.base import BaseBroker
from aistockadvisor.models.analysis import TradeSignal
from aistockadvisor.models.order import OrderResult
from aistockadvisor.portfolio.manager import PortfolioManager
from aistockadvisor.portfolio.risk import RiskManager

logger = logging.getLogger(__name__)


@dataclass
class ExecutionResult:
    """Result of a trade execution attempt."""

    executed: bool
    order: OrderResult | None = None
    reasons: list[str] = field(default_factory=list)


class TradeExecutor:
    """Validates signals through risk management, then executes via broker."""

    def __init__(
        self,
        broker: BaseBroker,
        risk_manager: RiskManager,
        portfolio_manager: PortfolioManager,
    ):
        self._broker = broker
        self._risk = risk_manager
        self._portfolio = portfolio_manager

    async def execute(self, signal: TradeSignal) -> ExecutionResult:
        """Execute a trade signal after risk validation."""
        portfolio = await self._portfolio.get_snapshot()

        # SAFETY: Risk check is mandatory
        risk_result = self._risk.validate_order(signal.order, portfolio)
        if not risk_result.approved:
            logger.warning(
                "Order REJECTED by risk manager: %s %s - %s",
                signal.order.side.value,
                signal.order.symbol,
                "; ".join(risk_result.reasons),
            )
            return ExecutionResult(executed=False, reasons=risk_result.reasons)

        # Log trade details
        logger.info(
            "Submitting order: %s %s via %s (paper=%s)",
            signal.order.side.value.upper(),
            signal.order.symbol,
            self._broker.broker_name,
            self._broker.is_paper,
        )

        try:
            result = await self._broker.submit_order(signal.order)
            self._risk.record_trade()
            await self._portfolio.record_trade(result)

            logger.info(
                "Order %s: %s %s - filled %s @ $%s",
                result.status,
                result.side.value,
                result.symbol,
                result.filled_qty,
                result.filled_avg_price,
            )

            return ExecutionResult(executed=True, order=result)

        except Exception as e:
            logger.error("Order execution failed: %s", e)
            return ExecutionResult(
                executed=False, reasons=[f"Execution error: {e}"]
            )
