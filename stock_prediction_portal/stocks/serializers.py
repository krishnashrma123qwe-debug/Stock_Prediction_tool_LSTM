from rest_framework import serializers
from .models import Watchlist, PredictionHistory


class WatchlistSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Watchlist
        fields = ['id', 'ticker', 'added_at']
        read_only_fields = ['id', 'added_at']

    def validate_ticker(self, value):
        v = value.upper().strip()
        if not v.isalpha() and '.' not in v:   # allow RELIANCE.NS etc.
            raise serializers.ValidationError("Invalid ticker symbol.")
        if len(v) > 20:
            raise serializers.ValidationError("Ticker too long.")
        return v

    def create(self, validated_data):
        user = self.context['request'].user
        ticker = validated_data['ticker']
        # get_or_create so double-add is silent, not an error
        obj, _ = Watchlist.objects.get_or_create(user=user, ticker=ticker)
        return obj


class PredictionHistorySerializer(serializers.ModelSerializer):
    was_correct = serializers.SerializerMethodField()

    class Meta:
        model  = PredictionHistory
        fields = [
            'id', 'ticker', 'predicted_at',
            'price_at_prediction', 'predicted_prices', 'historical_prices',
            'expected_return', 'predicted_high', 'predicted_low', 'signal',
            'actual_price_after_7d', 'actual_return_after_7d',
            'prediction_error', 'was_correct',
        ]
        read_only_fields = fields

    def get_was_correct(self, obj):
        return obj.was_correct