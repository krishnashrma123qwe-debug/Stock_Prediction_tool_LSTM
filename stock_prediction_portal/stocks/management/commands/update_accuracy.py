import logging
import yfinance as yf
import pandas as pd
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from stocks.models import PredictionHistory

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Updates 7-day accuracy metrics for PredictionHistory records that are older than 7 days.'

    def handle(self, *args, **options):
        # We need predictions made at least 7 days ago, matching the 7-day forecast limit
        cutoff_date = timezone.now() - timedelta(days=7)
        
        # Predictions missing the actual price
        pending_predictions = PredictionHistory.objects.filter(
            predicted_at__lt=cutoff_date,
            actual_price_after_7d__isnull=True
        )
        
        count = pending_predictions.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS("No pending predictions reached the 7-day mark yet."))
            return
            
        self.stdout.write(f"Found {count} records ready for accuracy update...")
        
        updated_count = 0
        for p in pending_predictions:
            target_date = p.predicted_at + timedelta(days=7)
            
            try:
                start_str = target_date.strftime('%Y-%m-%d')
                end_str = (target_date + timedelta(days=5)).strftime('%Y-%m-%d')
                
                # Fetch data starting exactly from the 7-day target
                df = yf.download(p.ticker, start=start_str, end=end_str, progress=False)
                
                # MultiIndex fix for newer yfinance versions
                if isinstance(df.columns, pd.MultiIndex):
                    df = df.copy()
                    df.columns = df.columns.get_level_values(0)
                
                if df.empty:
                    self.stdout.write(self.style.WARNING(f"Warning: No market data found for {p.ticker} around {start_str}."))
                    continue
                
                # The first available row is the closing price on the 7th day (or the Monday after if weekend)
                actual_price = float(df['Close'].iloc[0])
                predicted_price = sum(p.predicted_prices) / len(p.predicted_prices) if p.predicted_prices else p.price_at_prediction
                # Actually, p.predicted_prices[-1] is the exact 7th-day prediction
                if hasattr(p.predicted_prices, '__getitem__') and len(p.predicted_prices) > 0:
                    predicted_price = float(p.predicted_prices[-1])
                
                p.actual_price_after_7d = round(actual_price, 2)
                p.actual_return_after_7d = round((actual_price - p.price_at_prediction) / p.price_at_prediction * 100, 2)
                p.prediction_error = round(abs(actual_price - predicted_price), 2)
                p.save()
                
                updated_count += 1
                self.stdout.write(self.style.SUCCESS(f"Updated {p.ticker} (Predicted on: {p.predicted_at.strftime('%Y-%m-%d')}) -> Actual 7d price: ${actual_price:.2f}"))
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error checking accuracy for {p.ticker} (ID: {p.id}): {e}"))
                
        self.stdout.write(self.style.SUCCESS(f"\nSuccessfully logged accuracy for {updated_count} predictions."))
