"""Prompt templates for market analysis."""

from __future__ import annotations

from aistockadvisor.models.market import AnalysisContext


def build_market_analysis_messages(context: AnalysisContext) -> list[dict[str, str]]:
    """Build the messages for market analysis AI call."""
    system_msg = (
        "You are an expert financial analyst with deep knowledge of global markets, "
        "macroeconomics, and geopolitical events. Analyze the following stock data and "
        "news to provide an investment recommendation.\n\n"
        "You MUST respond with valid JSON containing exactly these fields:\n"
        '- "signal": one of "strong_buy", "buy", "hold", "sell", "strong_sell"\n'
        '- "confidence": float between 0.0 and 1.0\n'
        '- "reasoning": string explaining your analysis (2-3 paragraphs)\n'
        '- "news_summary": string summarizing relevant news impact\n'
        '- "market_context": string describing broader market conditions\n\n'
        "Consider:\n"
        "1. Price trends and technical indicators from the historical data\n"
        "2. Recent news sentiment and potential market impact\n"
        "3. Political and economic factors (interest rates, regulations, trade policy)\n"
        "4. Sector-specific dynamics\n"
        "5. Risk factors and potential downside scenarios\n\n"
        "Be conservative with confidence scores. Only use >0.8 when multiple "
        "strong signals align."
    )

    # Format price history
    price_lines = []
    for candle in context.price_history[-30:]:  # Last 30 data points
        price_lines.append(
            f"  {candle.timestamp.strftime('%Y-%m-%d')}: "
            f"O={candle.open} H={candle.high} L={candle.low} C={candle.close} V={candle.volume}"
        )
    price_history_str = "\n".join(price_lines) if price_lines else "  No historical data available"

    # Format news
    news_lines = []
    for article in context.recent_news[:15]:
        news_lines.append(
            f"  [{article.published_at.strftime('%Y-%m-%d')}] "
            f"{article.source}: {article.title}"
        )
        if article.description:
            news_lines.append(f"    {article.description[:200]}")
    news_str = "\n".join(news_lines) if news_lines else "  No recent news available"

    # Format ticker info
    ticker_str = ""
    if context.ticker_info:
        ti = context.ticker_info
        ticker_str = (
            f"\nCompany: {ti.name}\n"
            f"Sector: {ti.sector} | Industry: {ti.industry}\n"
            f"Market Cap: {ti.market_cap}\n"
            f"52W Range: {ti.fifty_two_week_low} - {ti.fifty_two_week_high}\n"
            f"P/E Ratio: {ti.pe_ratio}\n"
        )

    user_msg = (
        f"=== STOCK ANALYSIS REQUEST ===\n\n"
        f"Symbol: {context.symbol}\n"
        f"Current Price: ${context.current_price.price}\n"
        f"Change: {context.current_price.change} ({context.current_price.change_pct}%)\n"
        f"{ticker_str}\n"
        f"--- Price History (recent) ---\n{price_history_str}\n\n"
        f"--- Recent News ---\n{news_str}\n\n"
        f"Provide your analysis as JSON."
    )

    return [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ]


def build_portfolio_review_messages(portfolio_text: str) -> list[dict[str, str]]:
    """Build messages for portfolio review."""
    system_msg = (
        "You are a financial advisor reviewing a client's portfolio. "
        "Provide a concise review covering: overall health, risk exposure, "
        "diversification, and actionable suggestions. Be direct and specific."
    )
    return [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": f"Review this portfolio:\n\n{portfolio_text}"},
    ]
