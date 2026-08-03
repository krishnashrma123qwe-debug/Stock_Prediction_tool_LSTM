import os
import numpy as np
import pandas as pd
import yfinance as yf
import joblib
import logging
from celery import shared_task
from django.contrib.auth import get_user_model
from .models import PredictionHistory, Watchlist
from .sentiment import get_news_sentiment

logger = logging.getLogger(__name__)

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'stock_lstm_model.keras')
WINDOW     = 60

# ── Lazy loaders (shared with tasks) ──────────────────────────────────────────
_model    = None
_scalers  = None
_features = None

def get_model():
    global _model
    if _model is None:
        try:
            from keras.models import load_model
            _model = load_model(MODEL_PATH)
            logger.info("Multi-feature LSTM model loaded for task.")
        except Exception as e:
            logger.error(f"Failed to load LSTM model in task: {e}")
            raise RuntimeError("LSTM model file not found.")
    return _model

def get_scalers():
    global _scalers
    if _scalers is None:
        path = os.path.join(BASE_DIR, 'scaler.pkl')
        try:
            _scalers = joblib.load(path)
        except Exception as e:
            logger.error(f"Failed to load scalers in task: {e}")
            raise RuntimeError("scaler.pkl not found.")
    return _scalers

def get_features():
    global _features
    if _features is None:
        path = os.path.join(BASE_DIR, 'features.pkl')
        try:
            _features = joblib.load(path)
        except Exception:
            _features = ['Close', 'Open', 'High', 'Low', 'Volume', 'RSI', 'MACD', 'MA20']
    return _features

# ── Helpers ───────────────────────────────────────────────────────────────────
def safe_float(x):
    try:
        v = float(x)
        return v if np.isfinite(v) else None
    except Exception:
        return None

def to_list(series, n=60):
    out = []
    for x in series.iloc[-n:]:
        try:
            v = float(x)
            out.append(round(v, 3) if np.isfinite(v) else None)
        except Exception:
            out.append(None)
    return out

def build_feature_matrix(df):
    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = df.columns.get_level_values(0)
    out = pd.DataFrame()
    out['Close']  = df['Close'].squeeze().astype(float)
    out['Open']   = df['Open'].squeeze().astype(float)
    out['High']   = df['High'].squeeze().astype(float)
    out['Low']    = df['Low'].squeeze().astype(float)
    out['Volume'] = df['Volume'].squeeze().astype(float)
    delta = out['Close'].diff()
    gain  = delta.clip(lower=0)
    loss  = -delta.clip(upper=0)
    avg_g = gain.ewm(com=13, adjust=False).mean()
    avg_l = loss.ewm(com=13, adjust=False).mean().replace(0, np.nan)
    out['RSI']  = (100 - (100 / (1 + avg_g / avg_l))).fillna(50)
    ema12       = out['Close'].ewm(span=12, adjust=False).mean()
    ema26       = out['Close'].ewm(span=26, adjust=False).mean()
    out['MACD'] = ema12 - ema26
    out['MA20'] = out['Close'].rolling(20).mean()
    out.dropna(inplace=True)
    return out

def scale_features(feature_df, scalers, features):
    scaled_cols = []
    for feat in features:
        scaled = scalers[feat].transform(feature_df[feat].values.reshape(-1, 1)).flatten()
        scaled_cols.append(scaled)
    return np.column_stack(scaled_cols)

def compute_indicators(df):
    # Keep this logic here for the task to use
    raw = df['Close'].squeeze()
    if isinstance(raw, pd.DataFrame): raw = raw.iloc[:, 0]
    close = pd.Series(raw.values.flatten().astype(float))
    delta = close.diff()
    gain, loss = delta.clip(lower=0), -delta.clip(upper=0)
    avg_g = gain.ewm(com=13, adjust=False).mean()
    avg_l = loss.ewm(com=13, adjust=False).mean().replace(0, np.nan)
    rsi   = (100 - (100 / (1 + avg_g / avg_l))).round(2)
    last_rsi = safe_float(rsi.iloc[-1]) or 50.0
    rsi_signal = 'OVERBOUGHT' if last_rsi >= 70 else ('OVERSOLD' if last_rsi <= 30 else 'NEUTRAL')
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = (ema12 - ema26).round(3)
    signal_line = macd_line.ewm(span=9, adjust=False).mean().round(3)
    histogram = (macd_line - signal_line).round(3)
    macd_signal = 'BULLISH' if (safe_float(macd_line.iloc[-1]) or 0) > (safe_float(signal_line.iloc[-1]) or 0) else 'BEARISH'
    sma20, std20 = close.rolling(20).mean(), close.rolling(20).std()
    bb_upper, bb_lower = (sma20 + 2 * std20).round(2), (sma20 - 2 * std20).round(2)
    last_close = safe_float(close.iloc[-1]) or 0
    bb_signal = ('OVERBOUGHT' if last_close >= (safe_float(bb_upper.iloc[-1]) or float('inf'))
                  else 'OVERSOLD' if last_close <= (safe_float(bb_lower.iloc[-1]) or 0)
                  else 'NEUTRAL')
    return {
        'rsi':      { 'values': to_list(rsi),   'current': round(last_rsi, 2), 'signal': rsi_signal },
        'macd':     { 'macd_line': to_list(macd_line), 'signal_line': to_list(signal_line),
                      'histogram': to_list(histogram),  'signal': macd_signal },
        'bollinger':{ 'upper': to_list(bb_upper), 'middle': to_list(sma20.round(2)),
                      'lower': to_list(bb_lower),  'signal': bb_signal },
    }

@shared_task(bind=True)
def predict_stock_task(self, ticker, user_id):
    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return {'error': 'User not found'}

    try:
        model    = get_model()
        scalers  = get_scalers()
        features = get_features()
        
        from django.core.cache import cache
        cache_key = f"stock_data_{ticker}_6mo"
        df = cache.get(cache_key)
        
        if df is None:
            df = yf.download(ticker, period='6mo', interval='1d', progress=False)
            if not df.empty:
                cache.set(cache_key, df, 3600)  # Cache for 1 hour
        
        if df is None or df.empty: return {'error': f'No data for {ticker}'}

        feat_df = build_feature_matrix(df)
        if len(feat_df) < WINDOW: return {'error': f'Need {WINDOW} days of data'}

        scaled   = scale_features(feat_df, scalers, features)
        sequence = scaled[-WINDOW:].reshape(1, WINDOW, len(features))

        # Monte Carlo
        predictions_scaled = []
        for _ in range(20):
            preds_run, current_seq = [], sequence.copy()
            for _ in range(7):
                pred = model(current_seq, training=True).numpy()
                next_val = float(pred[0][0])
                preds_run.append(next_val)
                new_step = current_seq[0, -1, :].copy()
                new_step[0] = next_val
                current_seq = np.append(current_seq[:, 1:, :], new_step.reshape(1, 1, len(features)), axis=1)
            predictions_scaled.append(preds_run)

        predictions_scaled = np.array(predictions_scaled)
        close_scaler = scalers['Close']
        predicted_prices = close_scaler.inverse_transform(np.mean(predictions_scaled, axis=0).reshape(-1, 1)).flatten().tolist()
        confidence_upper = close_scaler.inverse_transform(np.percentile(predictions_scaled, 95, axis=0).reshape(-1, 1)).flatten().tolist()
        confidence_lower = close_scaler.inverse_transform(np.percentile(predictions_scaled, 5, axis=0).reshape(-1, 1)).flatten().tolist()

        historical_prices = scalers['Close'].inverse_transform(scaled[-WINDOW:, 0].reshape(-1, 1)).flatten().tolist()
        historical_ohlc = []
        for dt, row in feat_df.iloc[-WINDOW:].iterrows():
            historical_ohlc.append({
                'time': dt.strftime('%Y-%m-%d'),
                'open': round(float(row['Open']), 2),
                'high': round(float(row['High']), 2),
                'low': round(float(row['Low']), 2),
                'close': round(float(row['Close']), 2),
            })

        current_price = float(feat_df['Close'].iloc[-1])
        pred_high, pred_low = round(max(predicted_prices), 2), round(min(predicted_prices), 2)
        expected_return = round((predicted_prices[-1] - current_price) / current_price * 100, 2)
        signal = 'BUY' if expected_return > 2 else ('SELL' if expected_return < -2 else 'HOLD')
        
        indicators = compute_indicators(df)
        sentiment = get_news_sentiment(ticker)
        
        # Combined Signal
        combined_signal = signal
        abs_ret = abs(expected_return)
        sigs = [signal] * (3 if abs_ret > 8 else (2 if abs_ret > 5 else 1))
        if indicators:
            if indicators['rsi']['signal'] == 'OVERSOLD': sigs.append('BUY')
            if indicators['rsi']['signal'] == 'OVERBOUGHT': sigs.append('SELL')
            if indicators['macd']['signal'] == 'BULLISH': sigs.append('BUY')
            if indicators['macd']['signal'] == 'BEARISH': sigs.append('SELL')
        if sentiment and not sentiment.get('error'):
            if sentiment['label'] == 'BULLISH': sigs.append('BUY')
            if sentiment['label'] == 'BEARISH': sigs.append('SELL')

        buy_c, sell_c = sigs.count('BUY'), sigs.count('SELL')
        if buy_c > sell_c: combined_signal = 'STRONG BUY' if buy_c >= 3 else 'BUY'
        elif sell_c > buy_c: combined_signal = 'STRONG SELL' if sell_c >= 3 else 'SELL'
        else: combined_signal = 'HOLD'

        # DB Record
        PredictionHistory.objects.create(
            user=user, ticker=ticker,
            price_at_prediction=round(current_price, 2),
            predicted_prices=[round(p, 2) for p in predicted_prices],
            historical_prices=[round(p, 2) for p in historical_prices],
            expected_return=expected_return,
            predicted_high=pred_high, predicted_low=pred_low,
            signal=signal,
        )

        in_watchlist = Watchlist.objects.filter(user=user, ticker=ticker).exists()

        return {
            'ticker': ticker,
            'current_price': round(current_price, 2),
            'predicted_prices': [round(p, 2) for p in predicted_prices],
            'historical_prices': [round(p, 2) for p in historical_prices],
            'historical_ohlc': historical_ohlc,
            'confidence_upper': [round(p, 2) for p in confidence_upper],
            'confidence_lower': [round(p, 2) for p in confidence_lower],
            'expected_return': expected_return,
            'predicted_high': pred_high,
            'predicted_low': pred_low,
            'signal': signal,
            'combined_signal': combined_signal,
            'in_watchlist': in_watchlist,
            'indicators': indicators,
            'sentiment': sentiment,
        }

    except Exception as e:
        logger.exception(f"Task failed for {ticker}: {e}")
        return {'error': str(e)}
