from django.urls import path
from .views import (
    PredictStockView,
    PredictionHistoryView,
    PredictionHistoryStatsView,
    PredictionHistoryDetailView, # ← ADD THIS
    clear_prediction_history,    # ← ADD THIS
    WatchlistView,
    WatchlistDetailView,
    toggle_watchlist,
    BacktestView,
    TaskStatusView,
)

urlpatterns = [
    # Prediction
    path('predict/',           PredictStockView.as_view(),          name='predict'),
    path('task-status/<str:task_id>/', TaskStatusView.as_view(),     name='task-status'),

    # History
    path('history/',           PredictionHistoryView.as_view(),     name='history'),
    path('history/<int:pk>/',  PredictionHistoryDetailView.as_view(), name='history-detail'),
    path('history/clear/',     clear_prediction_history,            name='history-clear'),
    path('history/stats/',     PredictionHistoryStatsView.as_view(),name='history-stats'),

    # Watchlist
    path('watchlist/',         WatchlistView.as_view(),             name='watchlist'),
    path('watchlist/<int:pk>/',WatchlistDetailView.as_view(),       name='watchlist-detail'),
    path('watchlist/toggle/',  toggle_watchlist,                    name='watchlist-toggle'),

    # Backtest           ← ADD THIS
    path('backtest/',          BacktestView.as_view(),              name='backtest'),
]