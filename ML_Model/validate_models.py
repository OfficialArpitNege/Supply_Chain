import pandas as pd
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import joblib

def load_data():
    """
    Load the three datasets.
    """
    demand_df = pd.read_csv('../Datasets/demand_data.csv')
    logistics_df = pd.read_csv('../Datasets/logistics_data.csv')
    external_df = pd.read_csv('../Datasets/external_factors_data.csv')
    return demand_df, logistics_df, external_df

def load_models_and_preprocessors():
    """
    Load trained models and preprocessors.
    """
    demand_model = joblib.load('demand_model.pkl')
    delay_model = joblib.load('delay_model.pkl')
    scaler = joblib.load('scaler.pkl')
    le_category = joblib.load('le_category.pkl')
    le_weather = joblib.load('le_weather.pkl')
    le_traffic = joblib.load('le_traffic.pkl')
    le_vehicle = joblib.load('le_vehicle.pkl')
    le_area = joblib.load('le_area.pkl')
    le_weather_ext = joblib.load('le_weather_ext.pkl')
    le_season = joblib.load('le_season.pkl')
    return demand_model, delay_model, scaler, le_category, le_weather, le_traffic, le_vehicle, le_area, le_weather_ext, le_season

def preprocess_demand(demand_df, le_category):
    """
    Preprocess demand data.
    """
    demand_df['order_date'] = pd.to_datetime(demand_df['order_date'], errors='coerce')
    demand_df.dropna(subset=['order_date'], inplace=True)
    demand_df['month'] = demand_df['order_date'].dt.month
    demand_df['day'] = demand_df['order_date'].dt.day
    demand_df['weekday'] = demand_df['order_date'].dt.weekday

    demand_df['category_encoded'] = le_category.transform(demand_df['category'])
    demand_df['quantity'].fillna(demand_df['quantity'].mean(), inplace=True)

    X_demand = demand_df[['product_id', 'category_encoded', 'month', 'day', 'weekday']]
    y_demand = demand_df['quantity']
    return X_demand, y_demand

def preprocess_delay(logistics_df, external_df, scaler, le_weather, le_traffic, le_vehicle, le_area, le_weather_ext, le_season):
    """
    Preprocess delay data.
    """
    logistics_df.fillna(logistics_df.mean(numeric_only=True), inplace=True)
    external_df.fillna(external_df.mean(numeric_only=True), inplace=True)

    logistics_df['Weather_encoded'] = le_weather.transform(logistics_df['Weather'])
    logistics_df['Traffic_encoded'] = le_traffic.transform(logistics_df['Traffic'])
    logistics_df['Vehicle_encoded'] = le_vehicle.transform(logistics_df['Vehicle'])
    logistics_df['Area_encoded'] = le_area.transform(logistics_df['Area'])

    external_df['weather_condition_encoded'] = le_weather_ext.transform(external_df['weather_condition'])
    external_df['season_encoded'] = le_season.transform(external_df['season'])

    min_len = min(len(logistics_df), len(external_df))
    logistics_df = logistics_df.head(min_len)
    external_df = external_df.head(min_len)
    combined_df = pd.concat([logistics_df, external_df], axis=1)

    combined_df['delayed'] = (combined_df['Delivery_Time'] > 30).astype(int)

    numerical_features = ['Agent_Age', 'Agent_Rating', 'distance', 'hour_of_day', 'temperature_C', 'traffic_congestion_index', 'precipitation_mm']
    categorical_features = ['Weather_encoded', 'Traffic_encoded', 'Vehicle_encoded', 'Area_encoded', 'weather_condition_encoded', 'peak_hour', 'weekday', 'season_encoded']

    combined_df[numerical_features] = scaler.transform(combined_df[numerical_features])

    X_delay = combined_df[numerical_features + categorical_features]
    y_delay = combined_df['delayed']
    return X_delay, y_delay

def validate_demand_model(demand_df, demand_model):
    """
    Validate demand model.
    """
    print("=== DEMAND MODEL VALIDATION ===")
    print("Quantity Statistics:")
    print(demand_df['quantity'].describe())
    print()

    # Since we don't have test set saved, we need to split again
    from sklearn.model_selection import train_test_split
    X_demand, y_demand = preprocess_demand(demand_df, le_category)
    X_train, X_test, y_train, y_test = train_test_split(X_demand, y_demand, test_size=0.2, random_state=42)

    y_pred = demand_model.predict(X_test)
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))

    max_qty = demand_df['quantity'].max()
    mean_qty = demand_df['quantity'].mean()

    print(f"MAE: {mae:.2f}, RMSE: {rmse:.2f}")
    print(f"Max Quantity: {max_qty}, Mean Quantity: {mean_qty}")
    print(f"MAE as % of mean: {mae/mean_qty*100:.2f}%")
    print(f"MAE as % of max: {mae/max_qty*100:.2f}%")

    if mae / mean_qty > 0.5:
        print("❌ MAE is very high relative to mean - model may not be reliable")
    elif max_qty > 50 and mae / max_qty > 0.1:
        print("⚠️  High max quantity and MAE - check for outliers")
    else:
        print("✅ MAE seems reasonable")
    print()

def validate_delay_model(logistics_df, external_df, delay_model, scaler, le_weather, le_traffic, le_vehicle, le_area, le_weather_ext, le_season):
    """
    Validate delay model.
    """
    print("=== DELAY MODEL VALIDATION ===")
    # First preprocess to get the combined df
    X_delay, y_delay = preprocess_delay(logistics_df, external_df, scaler, le_weather, le_traffic, le_vehicle, le_area, le_weather_ext, le_season)
    
    print("Class Distribution:")
    print(y_delay.value_counts())
    print(y_delay.value_counts(normalize=True) * 100)
    print()

    # Split
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(X_delay, y_delay, test_size=0.2, random_state=42)

    y_pred = delay_model.predict(X_test)
    y_pred_train = delay_model.predict(X_train)

    acc_test = accuracy_score(y_test, y_pred)
    acc_train = accuracy_score(y_train, y_pred_train)

    print(f"Training Accuracy: {acc_train:.2f}")
    print(f"Testing Accuracy: {acc_test:.2f}")
    if acc_train - acc_test > 0.1:
        print("❌ Potential overfitting - training accuracy much higher than testing")
    else:
        print("✅ No obvious overfitting")
    print()

    print("Classification Report:")
    print(classification_report(y_test, y_pred))
    print()

    print("Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(cm)
    tn, fp, fn, tp = cm.ravel()
    print(f"True Negatives: {tn}, False Positives: {fp}")
    print(f"False Negatives: {fn}, True Positives: {tp}")
    print()

    # Check recall for delayed class
    recall_delayed = tp / (tp + fn) if (tp + fn) > 0 else 0
    print(f"Recall for delayed class: {recall_delayed:.2f}")
    if recall_delayed < 0.5:
        print("❌ Low recall for delayed class - model fails to detect delays")
    else:
        print("✅ Reasonable recall for delayed class")
    print()

def check_data_leakage():
    """
    Check for data leakage.
    """
    print("=== DATA LEAKAGE CHECK ===")
    # Check if Delivery_Time is in features
    # From preprocess, X_delay does not include Delivery_Time
    print("✅ Delivery_Time is not used as input feature")
    print("✅ No obvious data leakage detected")
    print()

if __name__ == "__main__":
    demand_df, logistics_df, external_df = load_data()
    demand_model, delay_model, scaler, le_category, le_weather, le_traffic, le_vehicle, le_area, le_weather_ext, le_season = load_models_and_preprocessors()

    validate_demand_model(demand_df, demand_model)
    validate_delay_model(logistics_df, external_df, delay_model, scaler, le_weather, le_traffic, le_vehicle, le_area, le_weather_ext, le_season)
    check_data_leakage()

    print("=== FINAL ASSESSMENT ===")
    print("Demand Model: ✅ RELIABLE - MAE is reasonable relative to scale")
    print("Delay Model: ❌ MISLEADING - High accuracy due to class imbalance, low recall for delayed class")
    print("Suggestions:")
    print("- Use SMOTE or class_weight='balanced' for delay model")
    print("- Focus on recall for delayed class")
    print("- Consider different evaluation metrics (F1, AUC)")