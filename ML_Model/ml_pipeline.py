import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, accuracy_score, confusion_matrix
import joblib
import os

def load_data():
    """
    Load the three datasets from the Datasets folder.
    """
    try:
        demand_df = pd.read_csv('../Datasets/demand_data.csv')
        logistics_df = pd.read_csv('../Datasets/logistics_data.csv')
        external_df = pd.read_csv('../Datasets/external_factors_data.csv')
        print("Datasets loaded successfully.")
        return demand_df, logistics_df, external_df
    except FileNotFoundError as e:
        print(f"Error loading data: {e}")
        raise

def preprocess_demand(demand_df):
    """
    Preprocess the demand dataset.
    - Convert order_date to datetime
    - Extract features: month, day, weekday
    - Encode category
    - Handle missing values
    """
    demand_df['order_date'] = pd.to_datetime(demand_df['order_date'], errors='coerce')
    demand_df.dropna(subset=['order_date'], inplace=True)
    demand_df['month'] = demand_df['order_date'].dt.month
    demand_df['day'] = demand_df['order_date'].dt.day
    demand_df['weekday'] = demand_df['order_date'].dt.weekday

    # Encode category
    le_category = LabelEncoder()
    demand_df['category_encoded'] = le_category.fit_transform(demand_df['category'])

    # Handle missing values (simple fill with mean for quantity)
    demand_df['quantity'].fillna(demand_df['quantity'].mean(), inplace=True)

    # Features for model
    X_demand = demand_df[['product_id', 'category_encoded', 'month', 'day', 'weekday']]
    y_demand = demand_df['quantity']

    return X_demand, y_demand, le_category

def preprocess_logistics_external(logistics_df, external_df):
    """
    Preprocess logistics and external datasets, merge them.
    - Encode categoricals
    - Normalize numerical
    - Create delay label
    """
    # Handle missing values
    logistics_df.fillna(logistics_df.mean(numeric_only=True), inplace=True)
    external_df.fillna(external_df.mean(numeric_only=True), inplace=True)

    # Encode categoricals in logistics
    le_weather = LabelEncoder()
    logistics_df['Weather_encoded'] = le_weather.fit_transform(logistics_df['Weather'])

    le_traffic = LabelEncoder()
    logistics_df['Traffic_encoded'] = le_traffic.fit_transform(logistics_df['Traffic'])

    le_vehicle = LabelEncoder()
    logistics_df['Vehicle_encoded'] = le_vehicle.fit_transform(logistics_df['Vehicle'])

    le_area = LabelEncoder()
    logistics_df['Area_encoded'] = le_area.fit_transform(logistics_df['Area'])

    # Encode in external
    le_weather_ext = LabelEncoder()
    external_df['weather_condition_encoded'] = le_weather_ext.fit_transform(external_df['weather_condition'])

    le_season = LabelEncoder()
    external_df['season_encoded'] = le_season.fit_transform(external_df['season'])

    # Assume merge on weekday (assuming same order)
    # For simplicity, take min length and concatenate
    min_len = min(len(logistics_df), len(external_df))
    logistics_df = logistics_df.head(min_len)
    external_df = external_df.head(min_len)
    combined_df = pd.concat([logistics_df, external_df], axis=1)

    # Create delay label: Delivery_Time > 30
    combined_df['delayed'] = (combined_df['Delivery_Time'] > 30).astype(int)

    # Features: numerical + encoded
    numerical_features = ['Agent_Age', 'Agent_Rating', 'distance', 'hour_of_day', 'temperature_C', 'traffic_congestion_index', 'precipitation_mm']
    categorical_features = ['Weather_encoded', 'Traffic_encoded', 'Vehicle_encoded', 'Area_encoded', 'weather_condition_encoded', 'peak_hour', 'weekday', 'season_encoded']

    # Normalize numerical
    scaler = StandardScaler()
    combined_df[numerical_features] = scaler.fit_transform(combined_df[numerical_features])

    X_delay = combined_df[numerical_features + categorical_features]
    y_delay = combined_df['delayed']

    return X_delay, y_delay, scaler, le_weather, le_traffic, le_vehicle, le_area, le_weather_ext, le_season

def train_models(X_demand, y_demand, X_delay, y_delay):
    """
    Train the two models.
    """
    # Split data
    X_train_demand, X_test_demand, y_train_demand, y_test_demand = train_test_split(X_demand, y_demand, test_size=0.2, random_state=42)
    X_train_delay, X_test_delay, y_train_delay, y_test_delay = train_test_split(X_delay, y_delay, test_size=0.2, random_state=42)

    # Train demand model
    demand_model = RandomForestRegressor(n_estimators=100, random_state=42)
    demand_model.fit(X_train_demand, y_train_demand)

    # Train delay model
    delay_model = RandomForestClassifier(n_estimators=100, random_state=42)
    delay_model.fit(X_train_delay, y_train_delay)

    print("Models trained successfully.")

    return demand_model, delay_model, X_test_demand, y_test_demand, X_test_delay, y_test_delay

def evaluate_models(demand_model, delay_model, X_test_demand, y_test_demand, X_test_delay, y_test_delay):
    """
    Evaluate the models.
    """
    # Evaluate demand
    y_pred_demand = demand_model.predict(X_test_demand)
    mae = mean_absolute_error(y_test_demand, y_pred_demand)
    rmse = np.sqrt(mean_squared_error(y_test_demand, y_pred_demand))
    print(f"Demand Model - MAE: {mae:.2f}, RMSE: {rmse:.2f}")

    # Evaluate delay
    y_pred_delay = delay_model.predict(X_test_delay)
    acc = accuracy_score(y_test_delay, y_pred_delay)
    cm = confusion_matrix(y_test_delay, y_pred_delay)
    print(f"Delay Model - Accuracy: {acc:.2f}")
    print(f"Confusion Matrix:\n{cm}")

if __name__ == "__main__":
    try:
        # Load data
        demand_df, logistics_df, external_df = load_data()
        print(f"Demand shape: {demand_df.shape}, Logistics shape: {logistics_df.shape}, External shape: {external_df.shape}")

        # Preprocess
        X_demand, y_demand, le_category = preprocess_demand(demand_df)
        print(f"Demand X shape: {X_demand.shape}, y shape: {y_demand.shape}")

        X_delay, y_delay, scaler, le_weather, le_traffic, le_vehicle, le_area, le_weather_ext, le_season = preprocess_logistics_external(logistics_df, external_df)
        print(f"Delay X shape: {X_delay.shape}, y shape: {y_delay.shape}")

        # Train
        demand_model, delay_model, X_test_demand, y_test_demand, X_test_delay, y_test_delay = train_models(X_demand, y_demand, X_delay, y_delay)

        # Evaluate
        evaluate_models(demand_model, delay_model, X_test_demand, y_test_demand, X_test_delay, y_test_delay)

        # Save models
        joblib.dump(demand_model, 'demand_model.pkl')
        joblib.dump(delay_model, 'delay_model.pkl')
        # Save preprocessors
        joblib.dump(scaler, 'scaler.pkl')
        joblib.dump(le_category, 'le_category.pkl')
        joblib.dump(le_weather, 'le_weather.pkl')
        joblib.dump(le_traffic, 'le_traffic.pkl')
        joblib.dump(le_vehicle, 'le_vehicle.pkl')
        joblib.dump(le_area, 'le_area.pkl')
        joblib.dump(le_weather_ext, 'le_weather_ext.pkl')
        joblib.dump(le_season, 'le_season.pkl')
        print("Models and preprocessors saved.")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()