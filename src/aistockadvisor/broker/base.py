"""Abstract broker interface."""

from __future__ import annotations

from abc import ABC, abstractmethod

from aistockadvisor.models.order import OrderRequest, OrderResult
from aistockadvisor.models.portfolio import AccountInfo, Position


class BaseBroker(ABC):
    """Abstract broker interface. All broker implementations must implement these methods."""

    @abstractmethod
    async def get_account(self) -> AccountInfo:
        """Get account information (balance, buying power, etc.)."""
        ...

    @abstractmethod
    async def submit_order(self, order: OrderRequest) -> OrderResult:
        """Submit an order to the broker."""
        ...

    @abstractmethod
    async def cancel_order(self, order_id: str) -> bool:
        """Cancel a pending order."""
        ...

    @abstractmethod
    async def get_positions(self) -> list[Position]:
        """Get all current positions."""
        ...

    @abstractmethod
    async def get_position(self, symbol: str) -> Position | None:
        """Get position for a specific symbol."""
        ...

    @abstractmethod
    async def close_position(self, symbol: str) -> OrderResult:
        """Close an entire position for a symbol."""
        ...

    @abstractmethod
    async def close_all_positions(self) -> list[OrderResult]:
        """Close all open positions."""
        ...

    @property
    @abstractmethod
    def is_paper(self) -> bool:
        """Whether this broker is in paper/simulated mode."""
        ...

    @property
    @abstractmethod
    def broker_name(self) -> str:
        """Human-readable broker name."""
        ...
