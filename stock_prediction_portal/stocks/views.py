import numpy as np
import yfinance as yf
import pandas as pd
import joblib
from .backtest import run_backtest
from sklearn.preprocessing import MinMaxScaler
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, generics
from rest_framework.decorators import api_view, permission_classes
import os
import logging

from .models import Watchlist, PredictionHistory
from .serializers import WatchlistSerializer, PredictionHistorySerializer
from .sentiment import get_news_sentiment

logger = logging.getLogger(__name__)

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'stock_lstm_model.keras')
WINDOW     = 60

# ── Lazy loaders ──────────────────────────────────────────────────────────────
_model    = None
_scalers  = None
_features = None

def get_model():
    global _model
    if _model is None:
        try:
            from keras.models import load_model
            _model = load_model(MODEL_PATH)
            logger.info("Multi-feature LSTM model loaded.")
        except Exception as e:
            logger.error(f"Failed to load LSTM model: {e}")
            raise RuntimeError("LSTM model file not found.")
    return _model


def get_scalers():
    global _scalers
    if _scalers is None:
        path = os.path.join(BASE_DIR, 'scaler.pkl')
        try:
            _scalers = joblib.load(path)
            logger.info("Scalers loaded.")
        except Exception as e:
            logger.error(f"Failed to load scalers: {e}")
            raise RuntimeError("scaler.pkl not found. Retrain the model first.")
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


# ── Build 8-feature matrix from yfinance df ───────────────────────────────────
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


def scale_features(feature_df, scalers, features):
    scaled_cols = []
    for feat in features:
        scaled = scalers[feat].transform(
            feature_df[feat].values.reshape(-1, 1)
        ).flatten()
        scaled_cols.append(scaled)
    return np.column_stack(scaled_cols)  # (n_days, n_features)


# ── Technical indicators ──────────────────────────────────────────────────────
def compute_indicators(df):
    raw = df['Close'].squeeze()
    if isinstance(raw, pd.DataFrame):
        raw = raw.iloc[:, 0]
    close = pd.Series(raw.values.flatten().astype(float))

    # RSI
    delta = close.diff()
    gain  = delta.clip(lower=0)
    loss  = -delta.clip(upper=0)
    avg_g = gain.ewm(com=13, adjust=False).mean()
    avg_l = loss.ewm(com=13, adjust=False).mean().replace(0, np.nan)
    rsi   = (100 - (100 / (1 + avg_g / avg_l))).round(2)
    last_rsi   = safe_float(rsi.iloc[-1]) or 50.0
    rsi_signal = 'OVERBOUGHT' if last_rsi >= 70 else ('OVERSOLD' if last_rsi <= 30 else 'NEUTRAL')

    # MACD
    ema12       = close.ewm(span=12, adjust=False).mean()
    ema26       = close.ewm(span=26, adjust=False).mean()
    macd_line   = (ema12 - ema26).round(3)
    signal_line = macd_line.ewm(span=9, adjust=False).mean().round(3)
    histogram   = (macd_line - signal_line).round(3)
    macd_signal = 'BULLISH' if (safe_float(macd_line.iloc[-1]) or 0) > (safe_float(signal_line.iloc[-1]) or 0) else 'BEARISH'

    # Bollinger
    sma20    = close.rolling(20).mean()
    std20    = close.rolling(20).std()
    bb_upper = (sma20 + 2 * std20).round(2)
    bb_lower = (sma20 - 2 * std20).round(2)
    last_close = safe_float(close.iloc[-1]) or 0
    bb_signal  = ('OVERBOUGHT' if last_close >= (safe_float(bb_upper.iloc[-1]) or float('inf'))
                  else 'OVERSOLD' if last_close <= (safe_float(bb_lower.iloc[-1]) or 0)
                  else 'NEUTRAL')

    return {
        'rsi':      { 'values': to_list(rsi),   'current': round(last_rsi, 2), 'signal': rsi_signal },
        'macd':     { 'macd_line': to_list(macd_line), 'signal_line': to_list(signal_line),
                      'histogram': to_list(histogram),  'signal': macd_signal },
        'bollinger':{ 'upper': to_list(bb_upper), 'middle': to_list(sma20.round(2)),
                      'lower': to_list(bb_lower),  'signal': bb_signal },
    }


# ── Predict View — MULTI-FEATURE ──────────────────────────────────────────────
class PredictStockView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ticker = request.query_params.get('ticker', 'AAPL').upper().strip()
        if not ticker.replace('.', '').isalpha() or len(ticker) > 20:
            return Response({'error': 'Invalid ticker symbol.'}, status=400)

        try:
            model    = get_model()
            scalers  = get_scalers()
            features = get_features()
        except RuntimeError as e:
            return Response({'error': str(e)}, status=503)

        try:
            # 1. Fetch 6 months OHLCV data
            df = yf.download(ticker, period='6mo', interval='1d', progress=False)
            if df.empty:
                return Response({'error': f'No data found for "{ticker}".'}, status=404)

            # 2. Build 8-feature matrix
            feat_df = build_feature_matrix(df)
            if len(feat_df) < WINDOW:
                return Response({'error': f'Need at least {WINDOW} trading days.'}, status=400)

            # 3. Scale all 8 features
            scaled   = scale_features(feat_df, scalers, features)  # (n_days, 8)
            sequence = scaled[-WINDOW:].reshape(1, WINDOW, len(features))

            # 4. Monte Carlo Dropout — 20 runs
            try:
                predictions_scaled = []
                for _ in range(20):
                    preds_run   = []
                    current_seq = sequence.copy()
                    for _ in range(7):
                        pred              = model(current_seq, training=True).numpy()
                        next_close_scaled = float(pred[0][0])
                        preds_run.append(next_close_scaled)
                        # Slide window — update Close (index 0), keep other features
                        new_step    = current_seq[0, -1, :].copy()
                        new_step[0] = next_close_scaled
                        current_seq = np.append(
                            current_seq[:, 1:, :],
                            new_step.reshape(1, 1, len(features)),
                            axis=1
                        )
                    predictions_scaled.append(preds_run)

                predictions_scaled = np.array(predictions_scaled)  # (20, 7)
                close_scaler       = scalers['Close']

                predicted_prices = close_scaler.inverse_transform(
                    np.mean(predictions_scaled, axis=0).reshape(-1, 1)
                ).flatten().tolist()

                confidence_upper = close_scaler.inverse_transform(
                    np.percentile(predictions_scaled, 95, axis=0).reshape(-1, 1)
                ).flatten().tolist()

                confidence_lower = close_scaler.inverse_transform(
                    np.percentile(predictions_scaled, 5, axis=0).reshape(-1, 1)
                ).flatten().tolist()

            except Exception as mc_err:
                logger.warning(f"MC fallback for {ticker}: {mc_err}")
                current_seq  = sequence.copy()
                preds_scaled = []
                for _ in range(7):
                    pred              = model.predict(current_seq, verbose=0)
                    next_close_scaled = float(pred[0][0])
                    preds_scaled.append(next_close_scaled)
                    new_step          = current_seq[0, -1, :].copy()
                    new_step[0]       = next_close_scaled
                    current_seq       = np.append(
                        current_seq[:, 1:, :],
                        new_step.reshape(1, 1, len(features)),
                        axis=1
                    )
                close_scaler     = scalers['Close']
                predicted_prices = close_scaler.inverse_transform(
                    np.array(preds_scaled).reshape(-1, 1)
                ).flatten().tolist()
                confidence_upper = [p * 1.02 for p in predicted_prices]
                confidence_lower = [p * 0.98 for p in predicted_prices]

            # 5. Historical close prices
            historical_prices = scalers['Close'].inverse_transform(
                scaled[-WINDOW:, 0].reshape(-1, 1)
            ).flatten().tolist()

            current_price   = float(feat_df['Close'].iloc[-1])
            pred_high       = round(max(predicted_prices), 2)
            pred_low        = round(min(predicted_prices), 2)
            expected_return = round(
                (predicted_prices[-1] - current_price) / current_price * 100, 2
            )
            signal = 'BUY' if expected_return > 2 else ('SELL' if expected_return < -2 else 'HOLD')

            predicted_prices_r  = [round(p, 2) for p in predicted_prices]
            historical_prices_r = [round(p, 2) for p in historical_prices]
            conf_upper_r        = [round(p, 2) for p in confidence_upper]
            conf_lower_r        = [round(p, 2) for p in confidence_lower]

            # 6. Technical indicators
            try:
                indicators = compute_indicators(df)
            except Exception as e:
                logger.warning(f"Indicators failed: {e}")
                indicators = None

            # 7. News sentiment
            try:
                sentiment = get_news_sentiment(ticker)
            except Exception as e:
                logger.warning(f"Sentiment failed: {e}")
                sentiment = None

            # 8. Combined signal
            combined_signal = signal
            sigs = [signal]
            if indicators:
                if indicators['rsi']['signal']  == 'OVERSOLD':   sigs.append('BUY')
                if indicators['rsi']['signal']  == 'OVERBOUGHT': sigs.append('SELL')
                if indicators['macd']['signal'] == 'BULLISH':    sigs.append('BUY')
                if indicators['macd']['signal'] == 'BEARISH':    sigs.append('SELL')
            if sentiment and not sentiment.get('error'):
                if sentiment['label'] == 'BULLISH': sigs.append('BUY')
                if sentiment['label'] == 'BEARISH': sigs.append('SELL')

            buy_c  = sigs.count('BUY')
            sell_c = sigs.count('SELL')
            if   buy_c  > sell_c: combined_signal = 'STRONG BUY'  if buy_c  >= 3 else 'BUY'
            elif sell_c > buy_c:  combined_signal = 'STRONG SELL' if sell_c >= 3 else 'SELL'
            else:                 combined_signal = 'HOLD'

            # 9. Save to DB
            PredictionHistory.objects.create(
                user=request.user, ticker=ticker,
                price_at_prediction=round(current_price, 2),
                predicted_prices=predicted_prices_r,
                historical_prices=historical_prices_r,
                expected_return=expected_return,
                predicted_high=pred_high,
                predicted_low=pred_low,
                signal=signal,
            )

            in_watchlist = Watchlist.objects.filter(user=request.user, ticker=ticker).exists()

            return Response({
                'ticker':            ticker,
                'current_price':     round(current_price, 2),
                'predicted_prices':  predicted_prices_r,
                'historical_prices': historical_prices_r,
                'confidence_upper':  conf_upper_r,
                'confidence_lower':  conf_lower_r,
                'expected_return':   expected_return,
                'predicted_high':    pred_high,
                'predicted_low':     pred_low,
                'signal':            signal,
                'combined_signal':   combined_signal,
                'in_watchlist':      in_watchlist,
                'data_points_used':  len(feat_df),
                'indicators':        indicators,
                'sentiment':         sentiment,
                'model_version':     'multi-feature-v2',
            })

        except Exception as e:
            logger.exception(f"Prediction error for {ticker}: {e}")
            return Response({'error': f'Prediction failed: {str(e)}'}, status=500)


# ── History ───────────────────────────────────────────────────────────────────
class PredictionHistoryView(generics.ListAPIView):
    serializer_class   = PredictionHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = PredictionHistory.objects.filter(user=self.request.user)
        t  = self.request.query_params.get('ticker')
        return qs.filter(ticker=t.upper()) if t else qs


class PredictionHistoryStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs    = PredictionHistory.objects.filter(user=request.user)
        total = qs.count()
        if total == 0:
            return Response({'total_predictions': 0})
        resolved = qs.exclude(actual_price_after_7d=None)
        correct  = [p for p in resolved if p.was_correct]
        from django.db.models import Count
        top = qs.values('ticker').annotate(count=Count('ticker')).order_by('-count')[:5]
        return Response({
            'total_predictions': total,
            'resolved':          resolved.count(),
            'correct_signals':   len(correct),
            'accuracy_pct':      round(len(correct)/resolved.count()*100,1) if resolved.count()>0 else None,
            'top_tickers':       list(top),
            'buy_signals':       qs.filter(signal='BUY').count(),
            'sell_signals':      qs.filter(signal='SELL').count(),
            'hold_signals':      qs.filter(signal='HOLD').count(),
        })


# ── Watchlist ─────────────────────────────────────────────────────────────────
class WatchlistView(generics.ListCreateAPIView):
    serializer_class   = WatchlistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Watchlist.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class WatchlistDetailView(generics.DestroyAPIView):
    serializer_class   = WatchlistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Watchlist.objects.filter(user=self.request.user)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def toggle_watchlist(request):
    ticker = request.data.get('ticker', '').upper().strip()
    if not ticker:
        return Response({'error': 'ticker is required'}, status=400)
    obj = Watchlist.objects.filter(user=request.user, ticker=ticker).first()
    if obj:
        obj.delete()
        return Response({'ticker': ticker, 'in_watchlist': False})
    Watchlist.objects.create(user=request.user, ticker=ticker)
    return Response({'ticker': ticker, 'in_watchlist': True}, status=201)


# ── Backtest View ─────────────────────────────────────────────────────────────
class BacktestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ticker  = request.query_params.get('ticker',  'AAPL').upper().strip()
        period  = request.query_params.get('period',  '1y')
        capital = request.query_params.get('capital', '100000')

        if not ticker.replace('.', '').isalpha() or len(ticker) > 20:
            return Response({'error': 'Invalid ticker symbol.'}, status=400)

        if period not in ['6mo', '1y', '2y']:
            period = '1y'

        try:
            capital = float(capital)
            if capital < 1000 or capital > 10_000_000:
                capital = 100000.0
        except ValueError:
            capital = 100000.0

        try:
            model = get_model()
        except RuntimeError as e:
            return Response({'error': str(e)}, status=503)

        try:
            result = run_backtest(
                ticker          = ticker,
                model           = model,
                initial_capital = capital,
                period          = period,
            )
            if result.get('error'):
                return Response({'error': result['error']}, status=400)
            return Response(result)

        except Exception as e:
            logger.exception(f"Backtest error for {ticker}: {e}")
            return Response({'error': f'Backtest failed: {str(e)}'}, status=500)