"""Shared test fixtures."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import pytest

from aistockadvisor.broker.paper import PaperBroker
from aistockadvisor.config.settings import Settings
from aistockadvisor.models.analysis import AnalysisResult, Signal
from aistockadvisor.models.market import OHLCV, AnalysisContext, Quote, TickerInfo
from aistockadvisor.models.news import NewsArticle
from aistockadvisor.models.order import OrderRequest, OrderSide, OrderType
from aistockadvisor.models.portfolio import AccountInfo, PortfolioSnapshot


@pytest.fixture
def settings():
    """Default test settings."""
    return Settings(
        broker_name="paper",
        broker_paper_mode=True,
        ai_provider="openai",
        openai_api_key="test-key",
        max_position_pct=0.10,
        max_total_exposure_pct=0.80,
        default_stop_loss_pct=0.05,
        max_daily_trades=10,
        max_order_value_usd=10000.0,
    )


@pytest.fixture
def paper_broker():
    """Paper broker with default cash."""
    return PaperBroker(initial_cash=100_000.0)


@pytest.fixture
def sample_quote():
    """Sample stock quote."""
    return Quote(
        symbol="AAPL",
        price=Decimal("185.50"),
        change=Decimal("2.30"),
        change_pct=1.25,
        volume=50_000_000,
    )


@pytest.fixture
def sample_history():
    """Sample OHLCV history."""
    return [
        OHLCV(
            timestamp=datetime(2024, 1, i, tzinfo=timezone.utc),
            open=Decimal(str(180 + i)),
            high=Decimal(str(182 + i)),
            low=Decimal(str(178 + i)),
            close=Decimal(str(181 + i)),
            volume=40_000_000 + i * 1_000_000,
        )
        for i in range(1, 11)
    ]


@pytest.fixture
def sample_context(sample_quote, sample_history):
    """Sample analysis context."""
    return AnalysisContext(
        symbol="AAPL",
        current_price=sample_quote,
        price_history=sample_history,
        ticker_info=TickerInfo(
            symbol="AAPL",
            name="Apple Inc.",
            sector="Technology",
            industry="Consumer Electronics",
        ),
        recent_news=[
            NewsArticle(
                title="Apple Reports Strong Earnings",
                description="Apple beats Q4 expectations",
                source="Reuters",
            ),
        ],
    )


@pytest.fixture
def sample_portfolio():
    """Sample portfolio snapshot."""
    return PortfolioSnapshot(
        account=AccountInfo(
            account_id="test",
            cash=Decimal("80000"),
            portfolio_value=Decimal("100000"),
            buying_power=Decimal("80000"),
        ),
        positions=[],
        total_market_value=Decimal("20000"),
    )


@pytest.fixture
def buy_order():
    """Sample buy order."""
    return OrderRequest(
        symbol="AAPL",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        notional=Decimal("5000"),
    )


@pytest.fixture
def sample_analysis():
    """Sample analysis result."""
    return AnalysisResult(
        symbol="AAPL",
        signal=Signal.BUY,
        confidence=0.85,
        reasoning="Strong earnings and positive momentum",
    )
