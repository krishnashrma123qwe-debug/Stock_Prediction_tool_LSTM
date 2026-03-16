from django.urls import path
from .views import PredictStockView

urlpatterns = [
    path('predict/', PredictStockView.as_view(), name='predict'),
]