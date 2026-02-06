"""Alpaca broker implementation for US stock trading."""

from __future__ import annotations

import asyncio
from decimal import Decimal

from aistockadvisor.broker.base import BaseBroker
from aistockadvisor.exceptions import BrokerError
from aistockadvisor.models.order import OrderRequest, OrderResult, OrderSide, OrderType
from aistockadvisor.models.portfolio import AccountInfo, Position


class AlpacaBroker(BaseBroker):
    """Alpaca broker implementation using alpaca-py SDK."""

    def __init__(self, api_key: str, api_secret: str, paper: bool = True):
        try:
            from alpaca.trading.client import TradingClient

            self._client = TradingClient(api_key, api_secret, paper=paper)
        except ImportError:
            raise BrokerError("alpaca-py is required: pip install alpaca-py")
        self._paper = paper

    @property
    def is_paper(self) -> bool:
        return self._paper

    @property
    def broker_name(self) -> str:
        return f"Alpaca {'Paper' if self._paper else 'Live'}"

    async def get_account(self) -> AccountInfo:
        account = await asyncio.to_thread(self._client.get_account)
        return AccountInfo(
            account_id=str(account.id),
            cash=Decimal(str(account.cash)),
            portfolio_value=Decimal(str(account.portfolio_value)),
            buying_power=Decimal(str(account.buying_power)),
            currency=account.currency or "USD",
        )

    async def submit_order(self, order: OrderRequest) -> OrderResult:
        from alpaca.trading.enums import OrderSide as AlpSide
        from alpaca.trading.enums import TimeInForce
        from alpaca.trading.requests import LimitOrderRequest, MarketOrderRequest

        side = AlpSide.BUY if order.side == OrderSide.BUY else AlpSide.SELL

        if order.order_type == OrderType.MARKET:
            req = MarketOrderRequest(
                symbol=order.symbol,
                qty=float(order.qty) if order.qty else None,
                notional=float(order.notional) if order.notional else None,
                side=side,
                time_in_force=TimeInForce.DAY,
            )
        elif order.order_type == OrderType.LIMIT:
            req = LimitOrderRequest(
                symbol=order.symbol,
                qty=float(order.qty) if order.qty else None,
                side=side,
                time_in_force=TimeInForce.DAY,
                limit_price=float(order.limit_price) if order.limit_price else None,
            )
        else:
            raise BrokerError(f"Order type {order.order_type} not yet supported for Alpaca")

        try:
            result = await asyncio.to_thread(self._client.submit_order, order_data=req)
        except Exception as e:
            raise BrokerError(f"Alpaca order failed: {e}") from e

        return OrderResult(
            order_id=str(result.id),
            symbol=result.symbol,
            side=order.side,
            status=str(result.status),
            filled_qty=Decimal(str(result.filled_qty)) if result.filled_qty else None,
            filled_avg_price=(
                Decimal(str(result.filled_avg_price))
                if result.filled_avg_price
                else None
            ),
        )

    async def cancel_order(self, order_id: str) -> bool:
        try:
            await asyncio.to_thread(self._client.cancel_order_by_id, order_id)
            return True
        except Exception:
            return False

    async def get_positions(self) -> list[Position]:
        positions = await asyncio.to_thread(self._client.get_all_positions)
        return [self._convert_position(p) for p in positions]

    async def get_position(self, symbol: str) -> Position | None:
        try:
            pos = await asyncio.to_thread(self._client.get_open_position, symbol)
            return self._convert_position(pos)
        except Exception:
            return None

    async def close_position(self, symbol: str) -> OrderResult:
        try:
            result = await asyncio.to_thread(
                self._client.close_position, symbol
            )
            return OrderResult(
                order_id=str(result.id) if hasattr(result, "id") else "unknown",
                symbol=symbol,
                side=OrderSide.SELL,
                status="pending",
            )
        except Exception as e:
            raise BrokerError(f"Failed to close position {symbol}: {e}") from e

    async def close_all_positions(self) -> list[OrderResult]:
        try:
            await asyncio.to_thread(self._client.close_all_positions, cancel_orders=True)
            return []  # Alpaca batch close doesn't return individual results
        except Exception as e:
            raise BrokerError(f"Failed to close all positions: {e}") from e

    @staticmethod
    def _convert_position(pos: object) -> Position:
        return Position(
            symbol=getattr(pos, "symbol", ""),
            qty=Decimal(str(getattr(pos, "qty", 0))),
            avg_entry_price=Decimal(str(getattr(pos, "avg_entry_price", 0))),
            current_price=Decimal(str(getattr(pos, "current_price", 0))),
            market_value=Decimal(str(getattr(pos, "market_value", 0))),
            unrealized_pnl=Decimal(str(getattr(pos, "unrealized_pl", 0))),
            unrealized_pnl_pct=float(getattr(pos, "unrealized_plpc", 0) or 0) * 100,
        )
