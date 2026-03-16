import numpy as np
import yfinance as yf
import joblib
from keras.models import load_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = load_model(os.path.join(BASE_DIR, 'stock_lstm_model.keras'))
scaler = joblib.load(os.path.join(BASE_DIR, 'scaler.pkl'))

WINDOW = 60

class PredictStockView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ticker = request.query_params.get('ticker', 'AAPL').upper()

        try:
            df = yf.download(ticker, period='6mo', interval='1d', progress=False)
            if df.empty or len(df) < WINDOW:
                return Response({'error': 'Not enough data for this ticker'}, status=400)

            close_prices = df[['Close']].values
            scaled = scaler.transform(close_prices)
            sequence = scaled[-WINDOW:].reshape(1, WINDOW, 1)

            predictions = []
            current_seq = sequence.copy()

            for _ in range(7):
                pred = model.predict(current_seq, verbose=0)
                predictions.append(pred[0][0])
                current_seq = np.append(current_seq[:, 1:, :], [[pred[0]]], axis=1)

            predicted_prices = scaler.inverse_transform(
                np.array(predictions).reshape(-1, 1)
            ).flatten().tolist()

            historical = scaler.inverse_transform(scaled[-60:]).flatten().tolist()
            current_price = float(close_prices[-1][0])

            return Response({
                'ticker': ticker,
                'current_price': round(current_price, 2),
                'predicted_prices': [round(p, 2) for p in predicted_prices],
                'historical_prices': [round(p, 2) for p in historical],
                'expected_return': round(
                    (predicted_prices[-1] - current_price) / current_price * 100, 2
                )
            })

        except Exception as e:
            return Response({'error': str(e)}, status=500)