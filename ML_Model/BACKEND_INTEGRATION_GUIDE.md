# Backend Integration Guide

## Model Status & Integration Path

### Models Ready for Integration

#### ✅ Demand Forecasting Model
**Status**: APPROVED - Production Ready
**Confidence**: High (51.5% better than baseline)

```python
# Integration Code Example
import joblib

# Load model
demand_model = joblib.load('models/demand_model_final.pkl')
config = joblib.load('models/model_config.pkl')

# Prepare input
def predict_demand(order_data):
    """
    Input: {product_id, category, month, weekday}
    Output: Forecasted quantity
    """
    features = prepare_features(order_data)
    prediction = demand_model.predict([features])[0]
    return {
        'quantity': round(prediction, 2),
        'confidence': 'high'
    }
```

**Usage**: Integrate immediately into backend API

---

#### ⚠️ Delay Prediction Model
**Status**: CONDITIONAL - Needs Careful Configuration
**Confidence**: Low for binary classification, acceptable for risk scoring

```python
# Integration Code Example
import joblib

# Load model
delay_model = joblib.load('models/delay_model_final.pkl')
config = joblib.load('models/model_config.pkl')

# Get probability (not binary prediction)
def assess_delivery_risk(delivery_data):
    """
    Returns probability of delay (0.0 to 1.0)
    Use with CUSTOM THRESHOLD - default 0.5 won't work
    """
    features = prepare_features(delivery_data)
    probability = delay_model.predict_proba([features])[0][1]
    
    return {
        'delay_probability': probability,
        'risk_level': interpret_probability(probability),
        'note': 'Conservative model - tends toward "risky"'
    }

def interpret_probability(prob):
    """Custom interpretation for this specific model"""
    if prob < 0.5:
        return 'LOW'      # Rare, high confidence non-delay
    elif prob < 0.8:
        return 'MEDIUM'   # Possible delay
    else:
        return 'HIGH'     # Likely delay
```

**Usage**: Integrate as **risk indicator only**, not binary classifier

---

## Recommended Backend Integration Strategy

### Phase 1: Immediate (Week 1)
```
✅ Integrate demand forecasting model
   - Endpoint: /api/forecast/demand
   - Input: product_id, category, month, weekday
   - Output: {quantity, confidence}
   - Expected improvement: +51%

⏸️ Hold delay model pending team decision
   - Evaluate Options A, B, C below
   - Make architecture decision
```

### Phase 2: Delay Model Integration (Choose One)

#### OPTION A: Conservative Risk Scoring (Quickest)
```
1. Integrate delay model as risk API
   - Endpoint: /api/risk/delivery-delay
   - Return: probability (0.0-1.0)
   - Add custom threshold logic in backend
   
2. Custom thresholds:
   - HIGH RISK: probability > 0.90
   - MEDIUM RISK: probability > 0.70
   - LOW RISK: probability <= 0.70
   
3. Documentation:
   - "Model is conservative - leans toward caution"
   - "Use for risk assessment, not definitive prediction"

Timeline: 1 week
Risk: Low
}
```

#### OPTION B: Retrain Before Integration (Better Quality)
```
1. Retrain delay model:
   - Adjust class_weight or SMOTE ratio
   - Focus on better class balance
   - Validate on holdout set

2. Once improved:
   - Integration as standard binary classifier
   - Endpoint: /api/predict/delivery-delay
   - Output: {delayed: true/false, probability}

3. Validation before deployment:
   - Ensure diversity check passes
   - Both classes predicted in test set
   - Probability distribution more balanced

Timeline: 3-4 weeks
Risk: Medium (retraining effort)
Quality: High (better model)
```

#### OPTION C: Hybrid Approach (Recommended)
```
1. Deploy demand model immediately (+51%)

2. Implement delay model as risk API (conservative)
   - Use probability > 0.80 as "likely delay"
   - Document limitations clearly
   
3. Monitor production performance for 2 weeks

4. Plan retraining with collected real-world data
   - Use actual non-delayed samples
   - Better class balance
   - Deploy improved model in Phase 2

Timeline: Week 1 deploy, Week 3-4 retrain
Risk: Low (phased approach)
Quality: Progressive improvement
```

---

## API Specifications

### Demand Forecasting Endpoint

```python
# Request
POST /api/forecast/demand
{
    "product_id": 642612,
    "category": "Pet Care",
    "month": 7,
    "weekday": 2
}

# Response (Success)
HTTP 200
{
    "status": "success",
    "quantity": 2.45,
    "unit": "units",
    "confidence": "high",
    "improvement_vs_baseline": "51.5%",
    "model_mae": 0.3274
}

# Response (Error)
HTTP 400
{
    "status": "error",
    "message": "Missing required fields: product_id"
}
```

### Delay Risk Assessment Endpoint (Risk Scoring Mode)

```python
# Request
POST /api/risk/delivery-delay
{
    "agent_age": 35,
    "agent_rating": 4.5,
    "distance": 25.5,
    "weather": "Sunny",
    "traffic": "Medium",
    "vehicle": "Two Wheeler",
    "area": "Urban",
    "weekday": 2,
    "temperature_c": 28.5,
    "traffic_congestion_index": 0.65,
    "precipitation_mm": 0,
    "weather_condition": "Clear",
    "season": "Summer"
}

# Response (Success)
HTTP 200
{
    "status": "success",
    "delay_probability": 0.847,
    "risk_level": "HIGH",
    "recommendation": "High delivery risk detected",
    "note": "Model is conservative - tends toward caution",
    "suggested_action": "Consider expedited handling or customer notification"
}

# Response (Alternative - Balanced Mode after retraining)
HTTP 200
{
    "status": "success",
    "delayed": true,
    "probability": 0.847,
    "confidence": "high",
    "model_version": "v2_retrained"
}
```

---

## Error Handling

### Missing Features
```python
try:
    predictions = model.predict(features)
except ValueError as e:
    if "X has" in str(e) and "features" in str(e):
        return {
            "error": "Invalid feature set",
            "message": "Check input has all required columns",
            "required_features": config['delay_features']
        }
```

### Unknown Categories
```python
# Handled automatically:
# - Unknown weather types → encoded to 0
# - Missing values → filled with mean
# - Out-of-range values → accepted (models handle extrapolation)
```

---

## Performance Monitoring

### Metrics to Track

```python
# For Demand Model
- Actual quantity vs predicted
- MAE trending (should stay ~0.32)
- RMSE and MAPE
- Bias analysis (over/under predictions)
- Seasonal performance

# For Delay Model
- Actual delays vs predicted
- False positive rate (unnecessary warnings)
- False negative rate (missed delays)
- Probability calibration
- Risk level accuracy
```

### Retraining Triggers

```
Retrain when:
1. MAE increases 20% above baseline (0.39+)
2. >10% systematic bias in predictions
3. New business logic requires model change
4. Quarterly scheduled retraining
5. Significant data distribution shift
```

---

## Code Examples for Backend

### Python/Flask Integration

```python
from flask import Flask, request, jsonify
import joblib
import pandas as pd

app = Flask(__name__)

# Load models once at startup
demand_model = joblib.load('models/demand_model_final.pkl')
delay_model = joblib.load('models/delay_model_final.pkl')
config = joblib.load('models/model_config.pkl')

@app.route('/api/forecast/demand', methods=['POST'])
def forecast_demand():
    try:
        data = request.json
        
        # Validate input
        required = ['product_id', 'category_encoded', 'month', 'weekday']
        if not all(k in data for k in required):
            return jsonify({'error': 'Missing fields'}), 400
        
        # Prepare features
        X = pd.DataFrame([data[required]])
        
        # Predict
        quantity = demand_model.predict(X)[0]
        
        return jsonify({
            'quantity': round(float(quantity), 2),
            'status': 'success'
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/delivery-delay', methods=['POST'])
def assess_delay_risk():
    try:
        data = request.json
        
        # Prepare features in correct order
        features = [
            data['agent_age'],
            data['agent_rating'],
            data['distance'],
            # ... encode categories
        ]
        
        # Get probability
        probability = delay_model.predict_proba([features])[0][1]
        
        # Interpret
        if probability > 0.90:
            risk = 'HIGH'
        elif probability > 0.70:
            risk = 'MEDIUM'
        else:
            risk = 'LOW'
        
        return jsonify({
            'delay_probability': round(float(probability), 4),
            'risk_level': risk,
            'status': 'success'
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] Load test both models (response time < 100ms)
- [ ] Test with sample data
- [ ] Verify error handling
- [ ] Setup monitoring/logging
- [ ] Document API endpoints
- [ ] Create user documentation

### Post-Deployment
- [ ] Monitor accuracy metrics
- [ ] Track API response times
- [ ] Check error rates
- [ ] Validate predictions with real data
- [ ] Setup alerts for drift
- [ ] Plan retraining schedule

### Operations
- [ ] Backup models
- [ ] Version control configs
- [ ] Document feature scaling
- [ ] Maintain encoder dictionaries
- [ ] Track model performance
- [ ] Schedule quarterly retraining

---

## Support & Troubleshooting

### Issue: "Model expects 14 features but got X"
**Solution**: Ensure all features in config are provided in correct order

### Issue: "All predictions are 'delayed'"
**Solution**: This is expected behavior for delay model in current form
- Use as risk indicator
- Consider threshold adjustments
- Plan model retraining

### Issue: "Demand predictions seem off"
**Solution**: Check:
1. Input values in expected range
2. Category encoding correct
3. Seasonal patterns match training data
4. Recent data shift (may need retraining)

### Issue: API response slow
**Solution**: 
1. Add model caching
2. Optimize feature engineering
3. Consider model compression
4. Profile inference time

---

**Integration Guide Version**: 1.0
**Last Updated**: April 20, 2026
**Next Review**: After Phase 1 deployment
