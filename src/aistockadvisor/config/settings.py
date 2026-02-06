"""Central configuration using pydantic-settings."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All application settings loaded from environment variables with AISA_ prefix."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="AISA_",
    )

    # Broker
    broker_name: str = "paper"
    broker_paper_mode: bool = True

    # Alpaca
    alpaca_api_key: SecretStr | None = None
    alpaca_api_secret: SecretStr | None = None
    alpaca_base_url: str = "https://paper-api.alpaca.markets"

    # AI Provider
    ai_provider: str = "openai"
    openai_api_key: SecretStr | None = None
    anthropic_api_key: SecretStr | None = None
    ai_model: str = "gpt-4o"

    # News
    news_api_key: SecretStr | None = None

    # Risk Controls
    max_position_pct: float = Field(default=0.10, ge=0.01, le=1.0)
    max_total_exposure_pct: float = Field(default=0.80, ge=0.1, le=1.0)
    default_stop_loss_pct: float = Field(default=0.05, ge=0.01, le=0.50)
    max_daily_trades: int = Field(default=10, ge=1, le=100)
    max_order_value_usd: float = Field(default=10000.0, ge=100.0)

    # General
    locale: str = "en"
    log_level: str = "INFO"
    analysis_interval_minutes: int = Field(default=60, ge=1)
    watchlist: str = "SPY,AAPL,MSFT,GOOGL,AMZN"

    @property
    def watchlist_symbols(self) -> list[str]:
        """Parse watchlist string into list of symbols."""
        return [s.strip().upper() for s in self.watchlist.split(",") if s.strip()]
