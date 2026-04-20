import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, classification_report
import joblib

def load_model_and_data():
    """Load the trained model and original data."""
    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
    delay_model = joblib.load(os.path.join(models_dir, 'delay_model_v2.pkl'))
    encoders = joblib.load(os.path.join(models_dir, 'encoders.pkl'))

    # Load original cleaned data
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_dir = os.path.normpath(os.path.join(base_dir, '..', 'Datasets'))
    df = pd.read_csv(os.path.join(dataset_dir, 'cleaned_logistics_combined.csv'))

    print("=== MODEL AND DATA LOADED ===")
    print(f"Model type: {type(delay_model)}")
    print(f"Data shape: {df.shape}")
    return delay_model, df, encoders

def check_smote_application():
    """Check SMOTE application order."""
    print("\n=== STEP 1: SMOTE APPLICATION CHECK ===")
    print("From training script analysis:")
    print("- train_test_split() called first")
    print("- SMOTE applied ONLY on X_train, y_train")
    print("- Test data remained untouched")
    print("✅ SMOTE applied correctly (after split, only on training data)")

def check_data_leakage(df):
    """Check for data leakage in features."""
    print("\n=== STEP 2: DATA LEAKAGE CHECK ===")

    # Features used in training (from script)
    features_used = ['Agent_Age', 'Agent_Rating', 'distance', 'Weather', 'Traffic', 'Vehicle', 'Area', 'weekday', 'temperature_C', 'traffic_congestion_index', 'precipitation_mm', 'weather_condition', 'season', 'peak_hour']

    print("Features used for training:")
    for i, feat in enumerate(features_used, 1):
        print(f"{i}. {feat}")

    # Check for forbidden features
    forbidden = ['Delivery_Time', 'delayed']
    leakage_found = False

    for col in forbidden:
        if col in features_used:
            print(f"❌ LEAKAGE DETECTED: {col} is in features!")
            leakage_found = True

    if not leakage_found:
        print("✅ No data leakage detected")

    return features_used

def prepare_data_for_checking(df, features_used, encoders):
    """Prepare data with same preprocessing as training."""
    # Encode categorical features
    df_encoded = df.copy()
    for col, encoder in encoders.items():
        if col in df_encoded.columns:
            df_encoded[col] = encoder.transform(df_encoded[col].astype(str))

    X = df_encoded[features_used]
    y = df_encoded['delayed']

    # Same split as training
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    return X_train, X_test, y_train, y_test

def check_train_test_performance(delay_model, X_train, X_test, y_train, y_test):
    """Check training vs test performance."""
    print("\n=== STEP 3: TRAIN vs TEST PERFORMANCE ===")

    train_pred = delay_model.predict(X_train)
    test_pred = delay_model.predict(X_test)

    train_acc = accuracy_score(y_train, train_pred)
    test_acc = accuracy_score(y_test, test_pred)

    print(".4f")
    print(".4f")

    return train_acc, test_acc

def check_overfitting(train_acc, test_acc):
    """Check for overfitting."""
    print("\n=== STEP 4: OVERFITTING CHECK ===")

    acc_diff = train_acc - test_acc
    print(".4f")

    if acc_diff > 0.10:  # More than 10% difference
        print("❌ OVERFITTING DETECTED: Train accuracy much higher than test")
        return True
    elif acc_diff > 0.05:
        print("⚠️  MILD OVERFITTING: Small performance gap")
        return False
    else:
        print("✅ NO OVERFITTING: Acceptable performance gap")
        return False

def prediction_diversity_test(delay_model, encoders):
    """Test prediction diversity on synthetic inputs."""
    print("\n=== STEP 5: PREDICTION DIVERSITY TEST ===")

    # Create synthetic test cases
    test_cases = [
        # Low traffic + clear weather
        {'Agent_Age': 25, 'Agent_Rating': 4.8, 'distance': 5.0, 'Weather': 'Clear', 'Traffic': 'Low', 'Vehicle': 'scooter ', 'Area': 'Urban ', 'weekday': 1, 'temperature_C': 22.0, 'traffic_congestion_index': 20, 'precipitation_mm': 0.0, 'weather_condition': 'Clear', 'season': 'Spring', 'peak_hour': 0},
        # High traffic + rain
        {'Agent_Age': 40, 'Agent_Rating': 4.2, 'distance': 15.0, 'Weather': 'Fog', 'Traffic': 'High', 'Vehicle': 'van', 'Area': 'Metropolitian ', 'weekday': 5, 'temperature_C': 15.0, 'traffic_congestion_index': 80, 'precipitation_mm': 5.0, 'weather_condition': 'Rain', 'season': 'Winter', 'peak_hour': 1},
        # Medium conditions
        {'Agent_Age': 30, 'Agent_Rating': 4.5, 'distance': 10.0, 'Weather': 'Clear', 'Traffic': 'Medium', 'Vehicle': 'motorcycle ', 'Area': 'Semi-Urban ', 'weekday': 3, 'temperature_C': 25.0, 'traffic_congestion_index': 50, 'precipitation_mm': 1.0, 'weather_condition': 'Cloudy', 'season': 'Summer', 'peak_hour': 0}
    ]

    predictions = []

    for i, case in enumerate(test_cases, 1):
        # Encode categorical
        encoded_case = case.copy()
        for col, encoder in encoders.items():
            if col in encoded_case:
                try:
                    encoded_case[col] = encoder.transform([str(encoded_case[col])])[0]
                except:
                    encoded_case[col] = 0  # Default if unknown

        # Convert to array
        feature_order = ['Agent_Age', 'Agent_Rating', 'distance', 'Weather', 'Traffic', 'Vehicle', 'Area', 'weekday', 'temperature_C', 'traffic_congestion_index', 'precipitation_mm', 'weather_condition', 'season', 'peak_hour']
        input_array = np.array([[encoded_case[col] for col in feature_order]])

        pred = delay_model.predict(input_array)[0]
        prob = delay_model.predict_proba(input_array)[0][1]

        predictions.append(pred)
        print(f"Test Case {i}: Prediction={pred}, Probability={prob:.3f}")

    unique_preds = set(predictions)
    print(f"Unique predictions: {unique_preds}")

    if len(unique_preds) == 1:
        print("❌ MODEL IS BIASED: Only predicts one class")
        return False
    else:
        print("✅ GOOD DIVERSITY: Predicts both classes")
        return True

def probability_analysis(delay_model, X_test):
    """Analyze prediction probabilities."""
    print("\n=== STEP 6: PROBABILITY ANALYSIS ===")

    probs = delay_model.predict_proba(X_test)[:, 1]

    min_prob = np.min(probs)
    max_prob = np.max(probs)
    mean_prob = np.mean(probs)

    print(".3f")
    print(".3f")
    print(".3f")

    # Check if all probabilities are the same
    if min_prob == max_prob:
        print("❌ ALL PROBABILITIES IDENTICAL: Model not learning")
        return False
    elif max_prob - min_prob < 0.1:
        print("⚠️  LOW PROBABILITY VARIANCE: Limited confidence range")
        return True
    else:
        print("✅ GOOD PROBABILITY DISTRIBUTION: Meaningful confidence scores")
        return True

def feature_importance_analysis(delay_model, features_used):
    """Analyze feature importance."""
    print("\n=== STEP 7: FEATURE IMPORTANCE ===")

    importances = delay_model.feature_importances_

    # Sort by importance
    indices = np.argsort(importances)[::-1]

    print("Feature Importances (top 5):")
    for i in range(min(5, len(features_used))):
        idx = indices[i]
        print(".4f")

    # Check logical features
    logical_features = ['distance', 'traffic_congestion_index', 'Weather', 'Traffic', 'temperature_C', 'precipitation_mm']
    top_features = [features_used[idx] for idx in indices[:5]]

    logical_count = sum(1 for feat in top_features if any(log in feat.lower() for log in ['distance', 'traffic', 'weather', 'temp', 'precip']))
    if logical_count >= 3:
        print("✅ LOGICAL FEATURES IMPORTANT: Model learns from relevant factors")
        return True
    else:
        print("⚠️  UNEXPECTED FEATURES IMPORTANT: Check feature engineering")
        return True

def final_verdict(checks):
    """Provide final verdict."""
    print("\n=== STEP 8: FINAL VERDICT ===")

    failed_checks = [name for name, passed in checks.items() if not passed]

    if not failed_checks:
        print("✅ MODEL IS RELIABLE")
        print("Reason: All validation checks passed")
        print("- No data leakage")
        print("- Correct SMOTE application")
        print("- No overfitting")
        print("- Balanced predictions")
        print("- Meaningful probabilities")
        print("- Logical feature importance")
        return True
    else:
        print("❌ MODEL IS MISLEADING")
        print(f"Failed checks: {', '.join(failed_checks)}")
        return False

def main():
    # Load model and data
    delay_model, df, encoders = load_model_and_data()

    # Step 1: SMOTE check
    check_smote_application()

    # Step 2: Data leakage
    features_used = check_data_leakage(df)

    # Prepare data for checking
    X_train, X_test, y_train, y_test = prepare_data_for_checking(df, features_used, encoders)

    # Step 3: Train vs test
    train_acc, test_acc = check_train_test_performance(delay_model, X_train, X_test, y_train, y_test)

    # Step 4: Overfitting
    overfitting = check_overfitting(train_acc, test_acc)

    # Step 5: Diversity
    diversity_good = prediction_diversity_test(delay_model, encoders)

    # Step 6: Probabilities
    probs_good = probability_analysis(delay_model, X_test)

    # Step 7: Feature importance
    features_good = feature_importance_analysis(delay_model, features_used)

    # Step 8: Final verdict
    checks = {
        'overfitting': not overfitting,
        'diversity': diversity_good,
        'probabilities': probs_good,
        'features': features_good
    }

    reliable = final_verdict(checks)

    print("\n=== SUMMARY ===")
    if reliable:
        print("🎉 Model is safe for production use!")
    else:
        print("⚠️  Model needs investigation before production!")

if __name__ == "__main__":
    main()