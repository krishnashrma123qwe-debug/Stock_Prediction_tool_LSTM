"""
News Sentiment for Stock Prediction Portal
==========================================
- Fetches headlines from Finnhub (free, no API key needed for basic news)
- Scores each headline using a lightweight VADER-inspired word-list scorer
- Returns: sentiment label, score, and list of headlines with individual scores

No extra pip install required — pure Python stdlib + requests (already in Django).
"""

import re
import requests
import logging
from datetime import datetime, timedelta
from django.conf import settings

logger = logging.getLogger(__name__)

# ── Finnhub free endpoint ─────────────────────────────────────────────────────
FINNHUB_TOKEN = getattr(settings, 'FINNHUB_API_KEY', 'demo')   # set in .env for better rate limits
FINNHUB_URL   = "https://finnhub.io/api/v1/company-news"

# ── Lightweight sentiment word lists (VADER-inspired) ─────────────────────────
POSITIVE_WORDS = {
    'surge','surges','surged','surging','rally','rallies','rallied','gain','gains','gained',
    'rise','rises','rose','rising','up','high','higher','highest','beat','beats','beating',
    'exceed','exceeds','exceeded','strong','stronger','strongest','record','profit','profits',
    'growth','grow','grew','growing','bull','bullish','buy','upgrade','upgraded','outperform',
    'boost','boosted','boosting','breakthrough','positive','good','great','excellent',
    'recover','recovery','recovered','recovering','opportunity','opportunities',
    'revenue','earnings','dividend','returns','upside','optimistic','confident',
    'expansion','expands','expanded','launch','launches','launched','innovation',
    'partnership','deal','deals','approved','approval','soar','soars','soared','soaring',
    'jump','jumps','jumped','climbing','climb','advances','advance','rebounded','rebound',
}

NEGATIVE_WORDS = {
    'fall','falls','fell','falling','drop','drops','dropped','dropping','decline','declines',
    'declined','declining','down','low','lower','lowest','loss','losses','lose','losing',
    'miss','misses','missed','weak','weaker','weakest','bear','bearish','sell','downgrade',
    'downgraded','underperform','cut','cuts','cutting','negative','bad','poor','terrible',
    'crash','crashes','crashed','crashing','risk','risks','risky','warning','warn','warns',
    'concern','concerns','worried','worry','worries','uncertain','uncertainty','volatile',
    'volatility','layoff','layoffs','lawsuit','lawsuits','investigation','probe','fraud',
    'deficit','debt','bankruptcy','bankrupt','default','crisis','recession','slowdown',
    'slows','slowed','shrink','shrinks','shrunk','plunge','plunges','plunged','plunging',
    'tumble','tumbles','tumbled','slide','slides','slid','sliding','retreat','retreats',
    'disappointing','disappoints','disappoint','trouble','troubled','troubles','halt','halted',
}

INTENSIFIERS = {
    'very','extremely','highly','significantly','substantially','sharply','dramatically',
    'massively','strongly','deeply','severely','greatly','considerably',
}

NEGATORS = {'not','no','never','nor','neither','without','lack','lacks','lacking','failed','fails'}


def _clean(text: str) -> list:
    """Lowercase, strip punctuation, tokenise."""
    return re.sub(r"[^a-z\s]", " ", text.lower()).split()


def score_headline(headline: str) -> float:
    """
    Returns a sentiment score between -1.0 (very negative) and +1.0 (very positive).
    Simple bag-of-words with negation and intensifier handling.
    """
    tokens = _clean(headline)
    score  = 0.0
    n      = len(tokens)

    for i, word in enumerate(tokens):
        # Check context window (previous 3 words for negators/intensifiers)
        context = tokens[max(0, i-3):i]
        negated    = any(w in NEGATORS    for w in context)
        intensified= any(w in INTENSIFIERS for w in context)
        multiplier = 1.5 if intensified else 1.0

        if word in POSITIVE_WORDS:
            val = +1.0 * multiplier
            score += -val if negated else val
        elif word in NEGATIVE_WORDS:
            val = -1.0 * multiplier
            score += -val if negated else val

    # Normalise to [-1, +1]
    if score == 0:
        return 0.0
    return max(-1.0, min(1.0, score / max(1, abs(score) + 1)))


def label_from_score(score: float) -> str:
    if score >= 0.15:
        return 'BULLISH'
    elif score <= -0.15:
        return 'BEARISH'
    return 'NEUTRAL'


def color_from_label(label: str) -> str:
    return {'BULLISH': '#1D9E75', 'BEARISH': '#E24B4A', 'NEUTRAL': '#EF9F27'}.get(label, '#888')


def get_news_sentiment(ticker: str, days_back: int = 7) -> dict:
    """
    Fetch recent news for a ticker and return aggregated sentiment.

    Returns:
    {
        'label':     'BULLISH' | 'BEARISH' | 'NEUTRAL',
        'score':     float (-1 to +1),
        'color':     hex color string,
        'headlines': [
            { 'title': str, 'source': str, 'url': str,
              'published': str, 'score': float, 'label': str }
        ],
        'total_articles': int,
        'positive_count': int,
        'negative_count': int,
        'neutral_count':  int,
        'error': str | None,
    }
    """
    today      = datetime.now()
    from_date  = (today - timedelta(days=days_back)).strftime('%Y-%m-%d')
    to_date    = today.strftime('%Y-%m-%d')

    try:
        resp = requests.get(
            FINNHUB_URL,
            params={
                'symbol': ticker,
                'from':   from_date,
                'to':     to_date,
                'token':  FINNHUB_TOKEN,
            },
            timeout=8,
        )
        resp.raise_for_status()
        articles = resp.json()

        if not articles:
            return _empty_result(ticker, "No recent news found for this ticker.")

    except requests.exceptions.Timeout:
        return _empty_result(ticker, "News API timed out — sentiment unavailable.")
    except Exception as e:
        logger.warning(f"Finnhub fetch failed for {ticker}: {e}")
        return _empty_result(ticker, f"Could not fetch news: {str(e)}")

    # Score each article
    scored = []
    for art in articles[:20]:                     # cap at 20 most recent
        title    = art.get('headline', '')
        summary  = art.get('summary', '')
        combined = f"{title} {summary}"
        s        = score_headline(combined)
        scored.append({
            'title':     title,
            'source':    art.get('source', ''),
            'url':       art.get('url', ''),
            'published': datetime.fromtimestamp(art.get('datetime', 0)).strftime('%b %d, %Y') if art.get('datetime') else '',
            'score':     round(s, 3),
            'label':     label_from_score(s),
        })

    if not scored:
        return _empty_result(ticker, "No scoreable articles found.")

    # Aggregate
    avg_score     = sum(a['score'] for a in scored) / len(scored)
    overall_label = label_from_score(avg_score)
    pos = sum(1 for a in scored if a['label'] == 'BULLISH')
    neg = sum(1 for a in scored if a['label'] == 'BEARISH')
    neu = sum(1 for a in scored if a['label'] == 'NEUTRAL')

    return {
        'label':          overall_label,
        'score':          round(avg_score, 3),
        'color':          color_from_label(overall_label),
        'headlines':      scored[:5],              # top 5 for frontend display
        'total_articles': len(scored),
        'positive_count': pos,
        'negative_count': neg,
        'neutral_count':  neu,
        'error':          None,
    }


def _empty_result(ticker: str, error: str) -> dict:
    return {
        'label': 'NEUTRAL', 'score': 0.0, 'color': '#EF9F27',
        'headlines': [], 'total_articles': 0,
        'positive_count': 0, 'negative_count': 0, 'neutral_count': 0,
        'error': error,
    }
