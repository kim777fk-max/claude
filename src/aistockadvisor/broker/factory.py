"""Broker factory - creates the appropriate broker based on configuration."""

from __future__ import annotations

from aistockadvisor.broker.base import BaseBroker
from aistockadvisor.broker.paper import PaperBroker
from aistockadvisor.config.settings import Settings
from aistockadvisor.exceptions import ConfigurationError


def create_broker(settings: Settings) -> BaseBroker:
    """Create a broker instance based on settings."""
    if settings.broker_name == "paper":
        return PaperBroker()

    if settings.broker_name == "alpaca":
        if not settings.alpaca_api_key or not settings.alpaca_api_secret:
            raise ConfigurationError(
                "Alpaca API credentials required. Set AISA_ALPACA_API_KEY and "
                "AISA_ALPACA_API_SECRET environment variables."
            )
        from aistockadvisor.broker.alpaca import AlpacaBroker

        return AlpacaBroker(
            api_key=settings.alpaca_api_key.get_secret_value(),
            api_secret=settings.alpaca_api_secret.get_secret_value(),
            paper=settings.broker_paper_mode,
        )

    raise ConfigurationError(
        f"Unknown broker: {settings.broker_name}. "
        f"Supported: paper, alpaca"
    )
