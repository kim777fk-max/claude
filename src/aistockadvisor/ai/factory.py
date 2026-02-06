"""AI analyzer factory."""

from __future__ import annotations

from aistockadvisor.ai.base import BaseAIAnalyzer
from aistockadvisor.config.settings import Settings
from aistockadvisor.exceptions import ConfigurationError


def create_analyzer(settings: Settings) -> BaseAIAnalyzer:
    """Create an AI analyzer based on settings."""
    if settings.ai_provider == "openai":
        if not settings.openai_api_key:
            raise ConfigurationError(
                "OpenAI API key required. Set AISA_OPENAI_API_KEY."
            )
        from aistockadvisor.ai.openai_analyzer import OpenAIAnalyzer

        return OpenAIAnalyzer(
            api_key=settings.openai_api_key.get_secret_value(),
            model=settings.ai_model,
        )

    if settings.ai_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise ConfigurationError(
                "Anthropic API key required. Set AISA_ANTHROPIC_API_KEY."
            )
        from aistockadvisor.ai.anthropic_analyzer import AnthropicAnalyzer

        return AnthropicAnalyzer(
            api_key=settings.anthropic_api_key.get_secret_value(),
            model=settings.ai_model if "claude" in settings.ai_model else "claude-sonnet-4-20250514",
        )

    raise ConfigurationError(
        f"Unknown AI provider: {settings.ai_provider}. Supported: openai, anthropic"
    )
