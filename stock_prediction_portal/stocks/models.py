from django.db import models
from django.conf import settings


class Watchlist(models.Model):
    """A ticker a user wants to track."""
    user    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='watchlist'
    )
    ticker  = models.CharField(max_length=20)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'ticker')   # no duplicates per user
        ordering = ['-added_at']

    def __str__(self):
        return f"{self.user.email} → {self.ticker}"


class PredictionHistory(models.Model):
    """Every prediction ever made — one row per API call."""
    user            = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='predictions'
    )
    ticker          = models.CharField(max_length=20, db_index=True)
    predicted_at    = models.DateTimeField(auto_now_add=True)

    # Snapshot of prices at prediction time
    price_at_prediction = models.FloatField()           # actual close price when predicted
    predicted_prices    = models.JSONField()            # list of 7 floats
    historical_prices   = models.JSONField()            # list of 60 floats

    # Derived metrics stored for quick querying
    expected_return     = models.FloatField()           # %
    predicted_high      = models.FloatField()
    predicted_low       = models.FloatField()
    signal              = models.CharField(max_length=10)  # BUY / HOLD / SELL

    # Accuracy tracking — filled in later by a scheduled job
    actual_price_after_7d = models.FloatField(null=True, blank=True)
    actual_return_after_7d = models.FloatField(null=True, blank=True)
    prediction_error      = models.FloatField(null=True, blank=True)  # MAE in $

    class Meta:
        ordering = ['-predicted_at']
        indexes = [
            models.Index(fields=['user', 'ticker']),
            models.Index(fields=['ticker', 'predicted_at']),
        ]

    def __str__(self):
        return f"{self.user.email} | {self.ticker} | {self.predicted_at:%Y-%m-%d %H:%M}"

    @property
    def was_correct(self):
        """Did the signal direction match reality?"""
        if self.actual_return_after_7d is None:
            return None
        if self.signal == 'BUY'  and self.actual_return_after_7d > 0:
            return True
        if self.signal == 'SELL' and self.actual_return_after_7d < 0:
            return True
        if self.signal == 'HOLD':
            return abs(self.actual_return_after_7d) < 2
        return False