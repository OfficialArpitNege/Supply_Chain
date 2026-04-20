import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, accuracy_score, confusion_matrix
from imblearn.over_sampling import SMOTE
import joblib

def load_data():
    """Load datasets."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_dir = os.path.normpath(os.path.join(base_dir, '..', 'Datasets'))
    demand_df = pd.read_csv(os.path.join(dataset_dir, 'demand_data.csv'))
    logistics_df = pd.read_csv(os.path.join(dataset_dir, 'logistics_data.csv'))
    external_df = pd.read_csv(os.path.join(dataset_dir, 'external_factors_data.csv'))
    return demand_df, logistics_df, external_df

def preprocess_demand(demand_df):
    """Preprocess demand data."""
    demand_df['order_date'] = pd.to_datetime(demand_df['order_date'], errors='coerce')
    demand_df.dropna(subset=['order_date'], inplace=True)
    demand_df['month'] = demand_df['order_date'].dt.month
    demand_df['day'] = demand_df['order_date'].dt.day
    demand_df['weekday'] = demand_df['order_date'].dt.weekday

    le_category = LabelEncoder()
    demand_df['category_encoded'] = le_category.fit_transform(demand_df['category'])
    demand_df['quantity'].fillna(demand_df['quantity'].mean(), inplace=True)

    X_demand = demand_df[['product_id', 'category_encoded', 'month', 'day', 'weekday']]
    y_demand = demand_df['quantity']
    return X_demand, y_demand, le_category

def preprocess_delay(logistics_df, external_df):
    """Preprocess delay data with SMOTE preparation."""
    logistics_df = logistics_df.copy()
    external_df = external_df.copy()

    logistics_df.fillna(logistics_df.mean(numeric_only=True), inplace=True)
    external_df.fillna(external_df.mean(numeric_only=True), inplace=True)

    le_weather = LabelEncoder()
    logistics_df['Weather_encoded'] = le_weather.fit_transform(logistics_df['Weather'].astype(str))

    le_traffic = LabelEncoder()
    logistics_df['Traffic_encoded'] = le_traffic.fit_transform(logistics_df['Traffic'].astype(str))

    le_vehicle = LabelEncoder()
    logistics_df['Vehicle_encoded'] = le_vehicle.fit_transform(logistics_df['Vehicle'].astype(str))

    le_area = LabelEncoder()
    logistics_df['Area_encoded'] = le_area.fit_transform(logistics_df['Area'].astype(str))

    le_weather_ext = LabelEncoder()
    external_df['weather_condition_encoded'] = le_weather_ext.fit_transform(external_df['weather_condition'].astype(str))

    le_season = LabelEncoder()
    external_df['season_encoded'] = le_season.fit_transform(external_df['season'].astype(str))

    min_len = min(len(logistics_df), len(external_df))
    logistics_df = logistics_df.head(min_len)
    external_df = external_df.head(min_len)
    combined_df = pd.concat([logistics_df.reset_index(drop=True), external_df.reset_index(drop=True)], axis=1)

    combined_df['delayed'] = (combined_df['Delivery_Time'] > 30).astype(int)

    numerical_features = [
        'Agent_Age', 'Agent_Rating', 'distance', 'hour_of_day',
        'temperature_C', 'traffic_congestion_index', 'precipitation_mm'
    ]
    categorical_features = [
        'Weather_encoded', 'Traffic_encoded', 'Vehicle_encoded', 'Area_encoded',
        'weather_condition_encoded', 'peak_hour', 'weekday', 'season_encoded'
    ]

    scaler = StandardScaler()
    combined_df[numerical_features] = scaler.fit_transform(combined_df[numerical_features])

    X_delay = combined_df[numerical_features + categorical_features]
    y_delay = combined_df['delayed']

    encoders = {
        'le_weather': le_weather,
        'le_traffic': le_traffic,
        'le_vehicle': le_vehicle,
        'le_area': le_area,
        'le_weather_ext': le_weather_ext,
        'le_season': le_season,
    }

    return X_delay, y_delay, scaler, encoders

def train_demand_model(X_demand, y_demand):
    """Train demand model."""
    X_train, X_test, y_train, y_test = train_test_split(X_demand, y_demand, test_size=0.2, random_state=42)
    demand_model = RandomForestRegressor(n_estimators=100, random_state=42)
    demand_model.fit(X_train, y_train)
    return demand_model, X_test, y_test

def train_delay_model(X_delay, y_delay):
    """Train delay model with SMOTE and balanced weights."""
    X_train, X_test, y_train, y_test = train_test_split(X_delay, y_delay, test_size=0.2, random_state=42, stratify=y_delay)

    smote = SMOTE(random_state=42)
    X_train_res, y_train_res = smote.fit_resample(X_train, y_train)

    delay_model = RandomForestClassifier(n_estimators=100, class_weight='balanced', random_state=42)
    delay_model.fit(X_train_res, y_train_res)

    return delay_model, X_test, y_test

def save_models_and_preprocessors(demand_model, delay_model, scaler, le_category, encoders):
    """Save models and preprocessors."""
    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
    os.makedirs(models_dir, exist_ok=True)

    # Save models
    demand_path = os.path.join(models_dir, 'demand_model_v2.pkl')
    delay_path = os.path.join(models_dir, 'delay_model_v2.pkl')
    joblib.dump(demand_model, demand_path)
    joblib.dump(delay_model, delay_path)

    # Save preprocessors
    scaler_path = os.path.join(models_dir, 'scaler.pkl')
    joblib.dump(scaler, scaler_path)

    le_category_path = os.path.join(models_dir, 'le_category.pkl')
    joblib.dump(le_category, le_category_path)

    for name, encoder in encoders.items():
        encoder_path = os.path.join(models_dir, f'{name}.pkl')
        joblib.dump(encoder, encoder_path)

    print(f"Models saved to {demand_path} and {delay_path}")
    print(f"Preprocessors saved to {models_dir}")

    return models_dir

def verify_files(models_dir):
    """Verify file sizes."""
    files = [
        'demand_model_v2.pkl', 'delay_model_v2.pkl', 'scaler.pkl', 'le_category.pkl',
        'le_weather.pkl', 'le_traffic.pkl', 'le_vehicle.pkl', 'le_area.pkl',
        'le_weather_ext.pkl', 'le_season.pkl'
    ]
    for file in files:
        path = os.path.join(models_dir, file)
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"{file}: {size} bytes")
            if size == 0:
                raise ValueError(f"File {file} is empty!")
        else:
            raise FileNotFoundError(f"File {file} not found!")

def test_loading(models_dir):
    """Test loading models."""
    demand_model = joblib.load(os.path.join(models_dir, 'demand_model_v2.pkl'))
    delay_model = joblib.load(os.path.join(models_dir, 'delay_model_v2.pkl'))
    scaler = joblib.load(os.path.join(models_dir, 'scaler.pkl'))
    le_category = joblib.load(os.path.join(models_dir, 'le_category.pkl'))
    print("Models and preprocessors loaded successfully")
    return demand_model, delay_model, scaler, le_category

def test_prediction(demand_model, delay_model, X_test_demand, X_test_delay, y_test_demand, y_test_delay):
    """Test predictions."""
    # Demand prediction
    sample_demand = X_test_demand.iloc[0:1]
    pred_demand = demand_model.predict(sample_demand)
    print(f"Demand prediction sample: {pred_demand[0]:.2f} (actual: {y_test_demand.iloc[0]:.2f})")

    # Delay prediction (using threshold 0.9)
    sample_delay = X_test_delay.iloc[0:1]
    probs = delay_model.predict_proba(sample_delay)
    pred_delay = (probs[0][1] >= 0.9).astype(int)
    actual_delay = y_test_delay.iloc[0]
    print(f"Delay prediction sample: {pred_delay} (prob: {probs[0][1]:.3f}, actual: {actual_delay})")

def main():
    print("=== RETRAINING MODELS ===")
    demand_df, logistics_df, external_df = load_data()

    # Preprocess
    X_demand, y_demand, le_category = preprocess_demand(demand_df)
    X_delay, y_delay, scaler, encoders = preprocess_delay(logistics_df, external_df)

    # Train
    demand_model, X_test_demand, y_test_demand = train_demand_model(X_demand, y_demand)
    delay_model, X_test_delay, y_test_delay = train_delay_model(X_delay, y_delay)

    print("Training completed successfully")

    # Save
    models_dir = save_models_and_preprocessors(demand_model, delay_model, scaler, le_category, encoders)

    # Verify
    verify_files(models_dir)

    # Test loading
    demand_model_loaded, delay_model_loaded, scaler_loaded, le_category_loaded = test_loading(models_dir)

    # Test prediction
    test_prediction(demand_model_loaded, delay_model_loaded, X_test_demand, X_test_delay, y_test_demand, y_test_delay)

    print("=== ALL TESTS PASSED ===")
    print("Models are ready for backend integration")

if __name__ == "__main__":
    main()