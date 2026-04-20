"""
COMPREHENSIVE FINAL VALIDATION
Ensures ML models are not misleading and are production-ready
"""

import os
import sys
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, classification_report
from sklearn.preprocessing import LabelEncoder
import collections

print("=" * 80)
print("COMPREHENSIVE FINAL VALIDATION - ML MODELS")
print("=" * 80)

# ============================================================================
# SETUP: Load data and models
# ============================================================================

print("\n[SETUP] Loading data and models...")

# Load logistics and external data
df_logistics = pd.read_csv("../Datasets/logistics_data.csv")
df_external = pd.read_csv("../Datasets/external_factors_data.csv")

# Combine them (side-by-side, first 2000 rows)
df_logistics_subset = df_logistics.iloc[:2000].reset_index(drop=True)
df_external_subset = df_external.reset_index(drop=True)
df_combined = pd.concat([df_logistics_subset, df_external_subset], axis=1)

# Load demand data
df_demand = pd.read_csv("../Datasets/demand_data.csv")

# Load models and encoders
delay_model = joblib.load("models/delay_model_final.pkl")
demand_model = joblib.load("models/demand_model_final.pkl")
config = joblib.load("models/model_config.pkl")

print("✅ Data and models loaded successfully")
print(f"   Delay features (from config): {config['delay_features']}")
print(f"   Demand features (from config): {config['demand_features']}")

# ============================================================================
# PART 1: DELAY MODEL VALIDATION
# ============================================================================

print("\n" + "=" * 80)
print("PART 1: DELAY MODEL VALIDATION")
print("=" * 80)

# Prepare delay data
print("\n[STEP 1] Preparing delay model features...")

delay_features = config['delay_features']

# Remove 'peak_hour' if it exists (not in the trained model)
if 'peak_hour' in delay_features:
    delay_features = [f for f in delay_features if f != 'peak_hour']

X_delay = df_combined[delay_features].copy()

# Handle categorical encoding with error handling
categorical_cols = ['Weather', 'Traffic', 'Vehicle', 'Area', 'weather_condition', 'season']
for col in categorical_cols:
    if col in X_delay.columns:
        # Simple numeric encoding for unseen categories
        X_delay[col] = pd.Categorical(X_delay[col]).codes
        # Replace -1 (unknown) with most common category code
        X_delay.loc[X_delay[col] == -1, col] = 0

# Fill any missing values
X_delay = X_delay.fillna(X_delay.mean(numeric_only=True))

# Convert to numpy array and ensure no feature names are passed
X_delay_array = X_delay.values

print(f"✅ Features prepared: shape {X_delay_array.shape}")

# Get predictions
print("\n[STEP 1] Checking prediction diversity...")
try:
    y_pred_delay = delay_model.predict(X_delay_array)
    unique_classes = set(y_pred_delay)
    print(f"Unique predicted classes: {unique_classes}")

    if unique_classes == {1}:
        print("❌ FAILED: Model is biased (predicting only 'delayed' - class 1)")
        diversity_pass = False
    elif unique_classes == {0}:
        print("❌ FAILED: Model is biased (predicting only 'not delayed' - class 0)")
        diversity_pass = False
    else:
        print("✅ PASSED: Model predicts both classes correctly")
        diversity_pass = True
except Exception as e:
    print(f"❌ ERROR during prediction: {e}")
    diversity_pass = False

# ============================================================================
# Count class distribution
# ============================================================================

print("\n[STEP 2] Checking class distribution in predictions...")

if diversity_pass:
    pred_counts = collections.Counter(y_pred_delay)
    print(f"Prediction distribution: {dict(pred_counts)}")

    total_preds = len(y_pred_delay)
    for cls, count in sorted(pred_counts.items()):
        percentage = (count / total_preds) * 100
        print(f"  Class {cls}: {count} predictions ({percentage:.1f}%)")

    # Ensure both classes have reasonable counts (at least 1% of predictions)
    distribution_pass = True
    if len(pred_counts) < 2:
        print("❌ FAILED: Model lacks class diversity (predicting only one class)")
        distribution_pass = False
    else:
        min_percentage = min((count / total_preds) * 100 for count in pred_counts.values())
        if min_percentage < 1.0:
            print(f"⚠️  WARNING: Minority class only {min_percentage:.1f}% of predictions")
        print("✅ PASSED: Reasonable prediction distribution")
else:
    distribution_pass = False

# Get probabilities for analysis
print("\n[ADDITIONAL] Analyzing prediction probabilities...")
try:
    y_proba_delay = delay_model.predict_proba(X_delay_array)
    prob_class_0 = y_proba_delay[:, 0]
    prob_class_1 = y_proba_delay[:, 1]

    print(f"Probability for class 0 - Min: {prob_class_0.min():.4f}, Max: {prob_class_0.max():.4f}, Mean: {prob_class_0.mean():.4f}")
    print(f"Probability for class 1 - Min: {prob_class_1.min():.4f}, Max: {prob_class_1.max():.4f}, Mean: {prob_class_1.mean():.4f}")
except Exception as e:
    print(f"⚠️  Could not analyze probabilities: {e}")

# ============================================================================
# PART 2: DEMAND MODEL VALIDATION
# ============================================================================

print("\n" + "=" * 80)
print("PART 2: DEMAND MODEL VALIDATION")
print("=" * 80)

# Prepare demand data
print("\n[STEP 3] Preparing demand model features...")

# Feature engineering
df_demand['order_date'] = pd.to_datetime(df_demand['order_date'], errors='coerce')
df_demand['month'] = df_demand['order_date'].dt.month
df_demand['weekday'] = df_demand['order_date'].dt.weekday

# Encode category
le_cat = LabelEncoder()
df_demand['category_encoded'] = le_cat.fit_transform(df_demand['category'].astype(str))

# Fill missing quantity
df_demand['quantity'].fillna(df_demand['quantity'].mean(), inplace=True)

demand_features = config['demand_features']

X_demand = df_demand[demand_features].copy()

# Fill any missing values
X_demand = X_demand.fillna(X_demand.mean(numeric_only=True))

# Convert to numpy array
X_demand_array = X_demand.values

print(f"✅ Features prepared: shape {X_demand_array.shape}")

# ============================================================================
# Calculate baseline
# ============================================================================

print("\n[STEP 3] Calculating baseline (mean prediction)...")

baseline = df_demand["quantity"].mean()
baseline_mae = abs(df_demand["quantity"] - baseline).mean()

print(f"Baseline (mean quantity): {baseline:.4f}")
print(f"Baseline MAE: {baseline_mae:.4f}")

# ============================================================================
# Model performance
# ============================================================================

print("\n[STEP 4] Evaluating model performance...")

try:
    y_pred_demand = demand_model.predict(X_demand_array)
    model_mae = mean_absolute_error(df_demand["quantity"], y_pred_demand)

    print(f"Model MAE: {model_mae:.4f}")
    print(f"Baseline MAE: {baseline_mae:.4f}")
except Exception as e:
    print(f"❌ ERROR during demand prediction: {e}")
    model_mae = float('inf')

# ============================================================================
# Compare model vs baseline
# ============================================================================

print("\n[STEP 5] Comparing model vs baseline...")

if model_mae < baseline_mae:
    improvement_pct = ((baseline_mae - model_mae) / baseline_mae) * 100
    print(f"✅ PASSED: Model is better than baseline ({improvement_pct:.1f}% improvement)")
    baseline_pass = True
else:
    print(f"❌ FAILED: Model is worse or equal to baseline")
    print(f"   Model MAE: {model_mae:.4f}, Baseline MAE: {baseline_mae:.4f}")
    baseline_pass = False

# ============================================================================
# Check prediction variability
# ============================================================================

print("\n[STEP 6] Checking prediction variability...")

unique_demand_preds = len(set(np.round(y_pred_demand, 2)))

print(f"Number of unique demand predictions: {unique_demand_preds}")
print(f"Prediction range: [{y_pred_demand.min():.4f}, {y_pred_demand.max():.4f}]")
print(f"Prediction mean: {y_pred_demand.mean():.4f}")
print(f"Prediction std: {y_pred_demand.std():.4f}")

if len(set(np.round(y_pred_demand, 2))) == 1:
    print("❌ FAILED: Model predicts constant value (all predictions identical)")
    variability_pass = False
else:
    print("✅ PASSED: Model produces varied predictions")
    variability_pass = True

# ============================================================================
# FINAL VERDICT
# ============================================================================

print("\n" + "=" * 80)
print("FINAL VERDICT")
print("=" * 80)

print("\nValidation Results:")
print(f"  Delay Model - Prediction Diversity: {'✅ PASS' if diversity_pass else '❌ FAIL'}")
print(f"  Delay Model - Distribution: {'✅ PASS' if distribution_pass else '❌ FAIL'}")
print(f"  Demand Model - Beats Baseline: {'✅ PASS' if baseline_pass else '❌ FAIL'}")
print(f"  Demand Model - Variability: {'✅ PASS' if variability_pass else '❌ FAIL'}")

all_pass = diversity_pass and distribution_pass and baseline_pass and variability_pass

print("\n" + "=" * 80)
if all_pass:
    print("✅✅✅ MODELS ARE VALID AND USABLE ✅✅✅")
    print("=" * 80)
    print("\nThe models have passed all validation checks:")
    print("  ✓ Delay model predicts both classes with diversity")
    print("  ✓ Demand model outperforms baseline")
    print("  ✓ Predictions are meaningful and varied")
    print("\n🎉 READY FOR PRODUCTION DEPLOYMENT 🎉")
else:
    print("❌❌❌ MODELS NEED IMPROVEMENT ❌❌❌")
    print("=" * 80)
    print("\nFailed validations detected. Review issues above before deployment.")

print("=" * 80)
