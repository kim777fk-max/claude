"""Risk management - validates orders against risk limits."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from decimal import Decimal

from aistockadvisor.config.settings import Settings
from aistockadvisor.models.order import OrderRequest, OrderSide
from aistockadvisor.models.portfolio import PortfolioSnapshot

logger = logging.getLogger(__name__)


@dataclass
class RiskCheckResult:
    """Result of risk validation."""

    approved: bool
    reasons: list[str] = field(default_factory=list)


class RiskManager:
    """Enforces risk limits on all trades."""

    def __init__(self, settings: Settings):
        self._max_position_pct = settings.max_position_pct
        self._max_exposure_pct = settings.max_total_exposure_pct
        self._stop_loss_pct = settings.default_stop_loss_pct
        self._max_daily_trades = settings.max_daily_trades
        self._max_order_value = Decimal(str(settings.max_order_value_usd))
        self._daily_trade_count = 0

    def validate_order(
        self, order: OrderRequest, portfolio: PortfolioSnapshot
    ) -> RiskCheckResult:
        """Run all risk checks. Returns approved/rejected with reasons."""
        failures: list[str] = []

        # Check daily trade limit
        if self._daily_trade_count >= self._max_daily_trades:
            failures.append(
                f"Daily trade limit reached ({self._max_daily_trades})"
            )

        # Check order value
        order_value = self._estimate_order_value(order)
        if order_value > self._max_order_value:
            failures.append(
                f"Order value ${order_value} exceeds max ${self._max_order_value}"
            )

        # Check position concentration (buys only)
        if order.side == OrderSide.BUY:
            portfolio_value = portfolio.account.portfolio_value
            if portfolio_value > 0:
                position_pct = float(order_value / portfolio_value)
                if position_pct > self._max_position_pct:
                    failures.append(
                        f"Position would be {position_pct:.1%} of portfolio "
                        f"(max {self._max_position_pct:.1%})"
                    )

            # Check total exposure
            new_exposure = portfolio.total_exposure_pct + float(
                order_value / portfolio_value if portfolio_value > 0 else 1
            )
            if new_exposure > self._max_exposure_pct:
                failures.append(
                    f"Total exposure would be {new_exposure:.1%} "
                    f"(max {self._max_exposure_pct:.1%})"
                )

        if failures:
            logger.warning("Order rejected: %s", "; ".join(failures))
            return RiskCheckResult(approved=False, reasons=failures)

        return RiskCheckResult(approved=True)

    def record_trade(self) -> None:
        """Record that a trade was executed (for daily limit tracking)."""
        self._daily_trade_count += 1

    def reset_daily_count(self) -> None:
        """Reset daily trade counter (call at start of each trading day)."""
        self._daily_trade_count = 0

    def calculate_stop_loss(
        self, entry_price: Decimal, side: OrderSide
    ) -> Decimal:
        """Calculate stop-loss price for a new position."""
        pct = Decimal(str(self._stop_loss_pct))
        if side == OrderSide.BUY:
            return entry_price * (1 - pct)
        return entry_price * (1 + pct)

    @staticmethod
    def _estimate_order_value(order: OrderRequest) -> Decimal:
        """Estimate the dollar value of an order."""
        if order.notional:
            return order.notional
        if order.qty and order.limit_price:
            return order.qty * order.limit_price
        if order.qty:
            # Rough estimate with placeholder; real price checked at execution
            return order.qty * Decimal("100")
        return Decimal("0")
