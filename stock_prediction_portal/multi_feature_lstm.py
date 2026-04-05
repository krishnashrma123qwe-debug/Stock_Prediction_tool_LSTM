"""
Multi-Feature LSTM — Stock Prediction Portal
=============================================
Run this entire script in your PricePrediction.ipynb
Replace all existing cells with these cells one by one.

Features used (8 total):
  1. Close price
  2. Open price
  3. High price
  4. Low price
  5. Volume (normalized)
  6. RSI (14-period)
  7. MACD line
  8. 20-day Moving Average

Each cell below is separated by: # ── CELL ──
"""

# ── CELL 1: Imports ──────────────────────────────────────────────────────────
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import yfinance as yf
import joblib
import warnings
warnings.filterwarnings('ignore')

from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
from keras.models import Sequential, Model
from keras.layers import LSTM, Dense, Dropout, Input
from keras.callbacks import EarlyStopping, ReduceLROnPlateau
from keras.optimizers import Adam

print("✅ All imports successful!")


# ── CELL 2: Download data for MULTIPLE tickers ────────────────────────────────
TICKERS  = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA']  # train on 5 stocks
START    = '2018-01-01'
END      = '2024-12-31'
WINDOW   = 60

all_data = []

for ticker in TICKERS:
    df = yf.download(ticker, start=START, end=END, progress=False)

    # Flatten multi-level columns
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df[['Open','High','Low','Close','Volume']].copy()
    df.dropna(inplace=True)

    # ── Feature engineering ───────────────────────────────────────────────────
    # RSI (14-period)
    delta = df['Close'].diff()
    gain  = delta.clip(lower=0)
    loss  = -delta.clip(upper=0)
    avg_g = gain.ewm(com=13, adjust=False).mean()
    avg_l = loss.ewm(com=13, adjust=False).mean().replace(0, np.nan)
    df['RSI'] = (100 - (100 / (1 + avg_g / avg_l))).fillna(50)

    # MACD line (12 - 26 EMA)
    ema12       = df['Close'].ewm(span=12, adjust=False).mean()
    ema26       = df['Close'].ewm(span=26, adjust=False).mean()
    df['MACD']  = ema12 - ema26

    # 20-day Moving Average
    df['MA20']  = df['Close'].rolling(20).mean()

    df.dropna(inplace=True)
    df['Ticker'] = ticker
    all_data.append(df)
    print(f"  {ticker}: {len(df)} rows, {df.shape[1]} columns")

print(f"\n✅ Data downloaded for {len(TICKERS)} tickers")
print(f"Features: {list(all_data[0].drop(columns='Ticker').columns)}")


# ── CELL 3: Scale and build sequences ────────────────────────────────────────
FEATURES = ['Close', 'Open', 'High', 'Low', 'Volume', 'RSI', 'MACD', 'MA20']
N_FEATURES = len(FEATURES)

# Fit ONE scaler per feature across ALL tickers
# This ensures the scaler generalises across different price ranges
scalers = {}
for feat in FEATURES:
    s = MinMaxScaler(feature_range=(0, 1))
    # Fit on all ticker data combined
    all_feat_data = np.concatenate([df[feat].values.reshape(-1,1) for df in all_data])
    s.fit(all_feat_data)
    scalers[feat] = s

print("✅ Scalers fitted on combined multi-ticker data")

def create_sequences(df, scalers, window=60):
    """Scale each feature separately then build sliding windows."""
    scaled_features = []
    for feat in FEATURES:
        scaled = scalers[feat].transform(df[feat].values.reshape(-1,1)).flatten()
        scaled_features.append(scaled)

    # shape: (n_days, n_features)
    data_scaled = np.column_stack(scaled_features)

    X, y = [], []
    for i in range(window, len(data_scaled)):
        X.append(data_scaled[i-window:i])          # (60, 8)
        y.append(data_scaled[i, 0])                # predict Close (feature 0)

    return np.array(X), np.array(y)

# Build sequences for all tickers
X_all, y_all = [], []
for df in all_data:
    X, y = create_sequences(df, scalers, WINDOW)
    X_all.append(X)
    y_all.append(y)

X_all = np.concatenate(X_all, axis=0)
y_all = np.concatenate(y_all, axis=0)

# Shuffle to mix tickers
idx    = np.random.permutation(len(X_all))
X_all  = X_all[idx]
y_all  = y_all[idx]

# Train / test split
split  = int(len(X_all) * 0.8)
X_train, X_test = X_all[:split], X_all[split:]
y_train, y_test = y_all[:split], y_all[split:]

print(f"\n✅ Sequences created")
print(f"X_train shape: {X_train.shape}  →  (samples, window=60, features=8)")
print(f"X_test  shape: {X_test.shape}")
print(f"Total samples: {len(X_all):,}")


# ── CELL 4: Build multi-feature LSTM model ────────────────────────────────────
model = Sequential([
    # Input: (60 days, 8 features)
    LSTM(128, return_sequences=True, input_shape=(WINDOW, N_FEATURES)),
    Dropout(0.2),

    LSTM(64, return_sequences=True),
    Dropout(0.2),

    LSTM(32, return_sequences=False),
    Dropout(0.2),

    Dense(32, activation='relu'),
    Dense(16, activation='relu'),
    Dense(1)   # predict next Close (scaled)
])

model.compile(
    optimizer=Adam(learning_rate=0.001),
    loss='mean_squared_error',
    metrics=['mae']
)

model.summary()
print(f"\n✅ Model built — {N_FEATURES} input features, 3 LSTM layers")


# ── CELL 5: Train ────────────────────────────────────────────────────────────
callbacks = [
    EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True, verbose=1),
    ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=3, verbose=1),
]

history = model.fit(
    X_train, y_train,
    epochs          = 30,
    batch_size      = 64,
    validation_data = (X_test, y_test),
    callbacks       = callbacks,
    verbose         = 1,
)

print("\n✅ Training complete!")


# ── CELL 6: Evaluate ─────────────────────────────────────────────────────────
# Plot training loss
plt.figure(figsize=(12, 4))
plt.subplot(1, 2, 1)
plt.plot(history.history['loss'],     label='Train Loss', color='#4f8ef7')
plt.plot(history.history['val_loss'], label='Val Loss',   color='#1D9E75')
plt.title('Training & Validation Loss')
plt.xlabel('Epoch')
plt.legend()
plt.grid(alpha=0.3)

plt.subplot(1, 2, 2)
plt.plot(history.history['mae'],     label='Train MAE', color='#4f8ef7')
plt.plot(history.history['val_mae'], label='Val MAE',   color='#1D9E75')
plt.title('Training & Validation MAE')
plt.xlabel('Epoch')
plt.legend()
plt.grid(alpha=0.3)
plt.tight_layout()
plt.show()

# Predictions on test set
y_pred_scaled = model.predict(X_test, verbose=0)

# Inverse transform Close price only (feature 0)
y_pred_actual = scalers['Close'].inverse_transform(y_pred_scaled).flatten()
y_test_actual = scalers['Close'].inverse_transform(y_test.reshape(-1,1)).flatten()

rmse = np.sqrt(mean_squared_error(y_test_actual, y_pred_actual))
mae  = mean_absolute_error(y_test_actual, y_pred_actual)

print(f"\n📊 Model Performance:")
print(f"   RMSE: ${rmse:.2f}")
print(f"   MAE:  ${mae:.2f}")

# Plot predictions vs actual (sample of 200 points)
plt.figure(figsize=(14, 5))
plt.plot(y_test_actual[:200],  color='#4f8ef7', label='Actual Price',    linewidth=2)
plt.plot(y_pred_actual[:200],  color='#1D9E75', label='Predicted Price', linewidth=2)
plt.title('Multi-Feature LSTM — Predicted vs Actual (Test Set Sample)')
plt.xlabel('Days')
plt.ylabel('Price (USD)')
plt.legend()
plt.grid(alpha=0.3)
plt.show()


# ── CELL 7: Save model + scalers ─────────────────────────────────────────────
# Save the Keras model
model.save('stock_lstm_model.keras')
print("✅ Model saved → stock_lstm_model.keras")

# Save ALL scalers as a dict (one per feature)
joblib.dump(scalers, 'scaler.pkl')
print("✅ Scalers saved → scaler.pkl")

# Save feature list so views.py knows the order
joblib.dump(FEATURES, 'features.pkl')
print("✅ Feature list saved → features.pkl")

print("\n🎉 Done! Copy these 3 files to stock_prediction_portal/stocks/:")
print("   → stock_lstm_model.keras")
print("   → scaler.pkl")
print("   → features.pkl")
