from django.urls import path
from .views import (
    PredictStockView,
    PredictionHistoryView,
    PredictionHistoryStatsView,
    WatchlistView,
    WatchlistDetailView,
    toggle_watchlist,
    BacktestView,          # ← ADD THIS
)

urlpatterns = [
    # Prediction
    path('predict/',           PredictStockView.as_view(),          name='predict'),

    # History
    path('history/',           PredictionHistoryView.as_view(),     name='history'),
    path('history/stats/',     PredictionHistoryStatsView.as_view(),name='history-stats'),

    # Watchlist
    path('watchlist/',         WatchlistView.as_view(),             name='watchlist'),
    path('watchlist/<int:pk>/',WatchlistDetailView.as_view(),       name='watchlist-detail'),
    path('watchlist/toggle/',  toggle_watchlist,                    name='watchlist-toggle'),

    # Backtest           ← ADD THIS
    path('backtest/',          BacktestView.as_view(),              name='backtest'),
]