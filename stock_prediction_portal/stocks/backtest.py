"""
Backtesting Engine — Multi-Feature LSTM version
================================================
Updated to use 8-feature input matching the retrained model.
"""

import numpy as np
import pandas as pd
import yfinance as yf
import joblib
import os
import logging

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WINDOW   = 60

BUY_THRESHOLD  =  2.0
SELL_THRESHOLD = -2.0
TRANSACTION_COST = 0.001


# ── Load scalers and features ─────────────────────────────────────────────────
def get_scalers():
    path = os.path.join(BASE_DIR, 'scaler.pkl')
    return joblib.load(path)


def get_features():
    path = os.path.join(BASE_DIR, 'features.pkl')
    try:
        return joblib.load(path)
    except Exception:
        return ['Close', 'Open', 'High', 'Low', 'Volume', 'RSI', 'MACD', 'MA20']


# ── Build 8-feature matrix ────────────────────────────────────────────────────
def build_feature_matrix(df):
    """Same as views.py — builds 8-feature DataFrame from yfinance data."""
    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = df.columns.get_level_values(0)

    df = df.dropna()

    out = pd.DataFrame(index=df.index)
    out['Close']  = df['Close'].squeeze().astype(float)
    out['Open']   = df['Open'].squeeze().astype(float)
    out['High']   = df['High'].squeeze().astype(float)
    out['Low']    = df['Low'].squeeze().astype(float)
    out['Volume'] = df['Volume'].squeeze().astype(float)

    # RSI
    delta = out['Close'].diff()
    gain  = delta.clip(lower=0)
    loss  = -delta.clip(upper=0)
    avg_g = gain.ewm(com=13, adjust=False).mean()
    avg_l = loss.ewm(com=13, adjust=False).mean().replace(0, np.nan)
    out['RSI']  = (100 - (100 / (1 + avg_g / avg_l))).fillna(50)

    # MACD
    ema12       = out['Close'].ewm(span=12, adjust=False).mean()
    ema26       = out['Close'].ewm(span=26, adjust=False).mean()
    out['MACD'] = ema12 - ema26

    # 20-day MA
    out['MA20'] = out['Close'].rolling(20).mean()

    out.dropna(inplace=True)
    return out


def scale_features(feat_df, scalers, features):
    """Scale each feature using its trained scaler."""
    scaled_cols = []
    for feat in features:
        scaled = scalers[feat].transform(
            feat_df[feat].values.reshape(-1, 1)
        ).flatten()
        scaled_cols.append(scaled)
    return np.column_stack(scaled_cols)  # (n_days, 8)


def get_signal(expected_return):
    if expected_return > BUY_THRESHOLD:
        return 'BUY'
    elif expected_return < SELL_THRESHOLD:
        return 'SELL'
    return 'HOLD'


# ── Main backtest function ────────────────────────────────────────────────────
def run_backtest(ticker: str, model, initial_capital: float = 100000.0,
                 period: str = '1y') -> dict:

    # 1. Load scalers and features
    try:
        scalers  = get_scalers()
        features = get_features()
    except Exception as e:
        return {'error': f'Could not load scalers: {str(e)}'}

    # 2. Fetch historical data
    try:
        df = yf.download(ticker, period=period, interval='1d', progress=False)
        if df is None or df.empty or len(df) < WINDOW + 10:
            return {'error': f'Not enough data for {ticker}.'}
    except Exception as e:
        return {'error': f'Data fetch failed: {str(e)}'}

    # 3. Build 8-feature matrix
    try:
        feat_df = build_feature_matrix(df)
        if len(feat_df) < WINDOW + 10:
            return {'error': f'Not enough clean data for {ticker}.'}
    except Exception as e:
        return {'error': f'Feature building failed: {str(e)}'}

    # 4. Scale features
    scaled = scale_features(feat_df, scalers, features)  # (n_days, 8)

    close_prices = feat_df['Close'].values
    open_prices  = feat_df['Open'].values
    dates        = feat_df.index

    # 5. Generate signals for each day
    signals     = []
    exp_returns = []

    for i in range(WINDOW, len(feat_df) - 7):
        # Build 8-feature sequence — (1, 60, 8)
        seq = scaled[i - WINDOW:i].reshape(1, WINDOW, len(features))

        try:
            # 5 Monte Carlo runs for speed
            preds = []
            for _ in range(5):
                current_seq = seq.copy()
                pred        = model(current_seq, training=True).numpy()
                preds.append(float(pred[0][0]))

            predicted_scaled = float(np.mean(preds))

            # Inverse transform Close only
            next_price = float(
                scalers['Close'].inverse_transform([[predicted_scaled]])[0][0]
            )
            current_price = float(close_prices[i])
            exp_return    = (next_price - current_price) / current_price * 100
            signal        = get_signal(exp_return)

        except Exception:
            signal     = 'HOLD'
            exp_return = 0.0

        signals.append(signal)
        exp_returns.append(round(exp_return, 3))

    # 6. Simulate trades
    trade_dates  = dates[WINDOW: len(feat_df) - 7]
    trade_closes = close_prices[WINDOW: len(feat_df) - 7]
    trade_opens  = open_prices[WINDOW: len(feat_df) - 7]

    capital     = initial_capital
    shares_held = 0.0
    in_position = False
    buy_price   = 0.0

    portfolio_values = []
    trade_log        = []

    for i, (date, sig, price, op, exp_ret) in enumerate(
        zip(trade_dates, signals, trade_closes, trade_opens, exp_returns)
    ):
        date_str = str(date.date()) if hasattr(date, 'date') else str(date)[:10]

        if sig == 'BUY' and not in_position:
            cost        = capital * (1 - TRANSACTION_COST)
            shares_held = cost / op
            buy_price   = op
            capital     = 0.0
            in_position = True
            trade_log.append({
                'date': date_str, 'action': 'BUY',
                'price': round(float(op), 2),
                'shares': round(shares_held, 4),
                'value': round(shares_held * op, 2),
                'exp_return': exp_ret, 'pnl': None, 'pnl_pct': None,
            })

        elif sig == 'SELL' and in_position:
            proceeds    = shares_held * op * (1 - TRANSACTION_COST)
            pnl         = proceeds - (shares_held * buy_price)
            pnl_pct     = (op - buy_price) / buy_price * 100
            capital     = proceeds
            shares_held = 0.0
            in_position = False
            trade_log.append({
                'date': date_str, 'action': 'SELL',
                'price': round(float(op), 2), 'shares': 0,
                'value': round(capital, 2), 'exp_return': exp_ret,
                'pnl': round(pnl, 2), 'pnl_pct': round(pnl_pct, 2),
            })

        port_val = capital + (shares_held * float(price))
        portfolio_values.append({
            'date': date_str,
            'value': round(port_val, 2),
            'price': round(float(price), 2),
        })

    # Close open position
    if in_position and shares_held > 0:
        last_price = float(trade_closes[-1])
        proceeds   = shares_held * last_price * (1 - TRANSACTION_COST)
        pnl        = proceeds - (shares_held * buy_price)
        pnl_pct    = (last_price - buy_price) / buy_price * 100
        capital    = proceeds
        trade_log.append({
            'date': str(trade_dates[-1])[:10], 'action': 'SELL (end)',
            'price': round(last_price, 2), 'shares': 0,
            'value': round(capital, 2), 'exp_return': 0,
            'pnl': round(pnl, 2), 'pnl_pct': round(pnl_pct, 2),
        })

    final_capital = capital if not in_position else capital + shares_held * float(trade_closes[-1])

    # 7. Metrics
    total_return_pct = (final_capital - initial_capital) / initial_capital * 100

    bh_start      = float(trade_closes[0])
    bh_end        = float(trade_closes[-1])
    bh_return_pct = (bh_end - bh_start) / bh_start * 100

    sell_trades = [t for t in trade_log if 'SELL' in t['action'] and t['pnl'] is not None]
    winning     = [t for t in sell_trades if t['pnl'] > 0]
    win_rate    = round(len(winning) / len(sell_trades) * 100, 1) if sell_trades else 0

    port_vals = [p['value'] for p in portfolio_values]
    peak      = initial_capital
    max_dd    = 0.0
    for v in port_vals:
        if v > peak: peak = v
        dd = (peak - v) / peak * 100
        if dd > max_dd: max_dd = dd

    if len(port_vals) > 1:
        daily_returns = pd.Series(port_vals).pct_change().dropna()
        sharpe = (daily_returns.mean() / daily_returns.std() * np.sqrt(252)
                  if daily_returns.std() > 0 else 0.0)
    else:
        sharpe = 0.0

    best_trade  = max(sell_trades, key=lambda t: t['pnl_pct']) if sell_trades else None
    worst_trade = min(sell_trades, key=lambda t: t['pnl_pct']) if sell_trades else None

    buy_signals  = signals.count('BUY')
    sell_signals = signals.count('SELL')
    hold_signals = signals.count('HOLD')

    return {
        'ticker':           ticker,
        'period':           period,
        'initial_capital':  round(initial_capital, 2),
        'final_capital':    round(final_capital, 2),
        'total_return':     round(total_return_pct, 2),
        'bh_return':        round(bh_return_pct, 2),
        'outperformed':     total_return_pct > bh_return_pct,
        'alpha':            round(total_return_pct - bh_return_pct, 2),
        'win_rate':         win_rate,
        'total_trades':     len(sell_trades),
        'winning_trades':   len(winning),
        'losing_trades':    len(sell_trades) - len(winning),
        'max_drawdown':     round(max_dd, 2),
        'sharpe_ratio':     round(float(sharpe), 3),
        'best_trade':       best_trade,
        'worst_trade':      worst_trade,
        'portfolio_values': portfolio_values[-252:],
        'trade_log':        trade_log[-20:],
        'signal_counts': {
            'buy':  buy_signals,
            'sell': sell_signals,
            'hold': hold_signals,
        },
        'error': None,
    }