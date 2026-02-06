"""Custom exception hierarchy for AI Stock Advisor."""


class AISAError(Exception):
    """Base exception for all AI Stock Advisor errors."""


class ConfigurationError(AISAError):
    """Raised when configuration is invalid or missing."""


class BrokerError(AISAError):
    """Raised when a broker operation fails."""


class OrderRejectedError(BrokerError):
    """Raised when an order is rejected by the broker or risk manager."""


class InsufficientFundsError(BrokerError):
    """Raised when account has insufficient funds for an order."""


class DataFetchError(AISAError):
    """Raised when market or news data cannot be fetched."""


class AIAnalysisError(AISAError):
    """Raised when AI analysis fails."""


class RiskLimitExceededError(AISAError):
    """Raised when a trade would exceed risk limits."""
