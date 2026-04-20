import os
import pandas as pd
from imblearn.over_sampling import SMOTE

def load_datasets():
    """Load logistics and external datasets."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_dir = os.path.normpath(os.path.join(base_dir, '..', 'Datasets'))

    logistics_path = os.path.join(dataset_dir, 'logistics_data.csv')
    external_path = os.path.join(dataset_dir, 'external_factors_data.csv')

    df = pd.read_csv(logistics_path)
    df_ext = pd.read_csv(external_path)

    print("=== LOGISTICS DATASET ===")
    print(f"Shape: {df.shape}")
    print(df.head())
    print("\n=== EXTERNAL FACTORS DATASET ===")
    print(f"Shape: {df_ext.shape}")
    print(df_ext.head())

    return df, df_ext

def handle_missing_values(df, df_ext):
    """Handle missing values in both datasets."""
    # Replace empty strings with NaN
    df.replace("", pd.NA, inplace=True)
    df_ext.replace("", pd.NA, inplace=True)

    # Fill missing values for numerical columns with mean
    df.fillna(df.mean(numeric_only=True), inplace=True)
    df_ext.fillna(df_ext.mean(numeric_only=True), inplace=True)

    # For categorical, fill with mode or drop if too many missing
    for col in df.select_dtypes(include=['object']).columns:
        if df[col].isnull().sum() > 0:
            df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else "Unknown", inplace=True)

    for col in df_ext.select_dtypes(include=['object']).columns:
        if df_ext[col].isnull().sum() > 0:
            df_ext[col].fillna(df_ext[col].mode()[0] if not df_ext[col].mode().empty else "Unknown", inplace=True)

    print("\n=== MISSING VALUES HANDLED ===")
    print(f"Logistics missing values: {df.isnull().sum().sum()}")
    print(f"External missing values: {df_ext.isnull().sum().sum()}")

    return df, df_ext

def standardize_categorical(df):
    """Standardize categorical values."""
    # Weather standardization
    df["Weather"] = df["Weather"].astype(str).str.lower()

    weather_map = {
        "haze": "Fog",
        "mist": "Fog",
        "smoke": "Fog",
        "clear sky": "Clear",
        "sunny": "Clear",
        "rainy": "Rain",
        "drizzle": "Rain",
        "overcast": "Fog",
        "cloudy": "Fog"
    }

    df["Weather"] = df["Weather"].map(weather_map).fillna("Clear")

    # Traffic standardization
    df["Traffic"] = df["Traffic"].astype(str).str.lower()

    traffic_map = {
        "light": "Low",
        "moderate": "Medium",
        "heavy": "High",
        "jam": "High",
        "free": "Low"
    }

    df["Traffic"] = df["Traffic"].map(traffic_map).fillna("Medium")

    print("\n=== CATEGORICAL VALUES STANDARDIZED ===")
    print(f"Weather unique values: {df['Weather'].unique()}")
    print(f"Traffic unique values: {df['Traffic'].unique()}")

    return df

def create_target_variable(df):
    """Create delayed target variable."""
    df["delayed"] = (df["Delivery_Time"] > 30).astype(int)
    print("\n=== TARGET VARIABLE CREATED ===")
    print(f"Delayed distribution: {df['delayed'].value_counts()}")
    print(f"Delayed percentage: {df['delayed'].value_counts(normalize=True)}")
    return df

def handle_class_imbalance(df):
    """Check class imbalance (SMOTE will be applied later on full dataset)."""
    if 'delayed' in df.columns:
        print("\n=== CLASS DISTRIBUTION ===")
        print(df['delayed'].value_counts())
        print(df['delayed'].value_counts(normalize=True))
    return df

def feature_engineering(df):
    """Add feature engineering."""
    # Assuming Order_Time and Order_Date exist or we create them
    # In the dataset, there might be date columns
    # For now, we'll assume some date handling

    # If Order_Time exists, convert to datetime
    if 'Order_Time' in df.columns:
        df["Order_Time"] = pd.to_datetime(df["Order_Time"], errors="coerce")
        df["hour_of_day"] = df["Order_Time"].dt.hour
    else:
        # Create dummy hour_of_day if not present
        df["hour_of_day"] = 12  # Default

    if 'Order_Date' in df.columns:
        df["Order_Date"] = pd.to_datetime(df["Order_Date"], errors="coerce")
        df["weekday"] = df["Order_Date"].dt.weekday
    else:
        df["weekday"] = 0  # Default Monday

    print("\n=== FEATURE ENGINEERING COMPLETED ===")
    print(f"Added hour_of_day and weekday features")

    return df

def final_clean_dataset(df, df_ext):
    """Create final clean combined dataset."""
    # Combine logistics and external
    min_len = min(len(df), len(df_ext))
    df = df.head(min_len).reset_index(drop=True)
    df_ext = df_ext.head(min_len).reset_index(drop=True)

    # Select columns from logistics
    logistics_cols = ['Agent_Age', 'Agent_Rating', 'distance', 'Delivery_Time', 'Weather', 'Traffic', 'Vehicle', 'Area', 'weekday', 'delayed']
    df_log = df[[col for col in logistics_cols if col in df.columns]]

    # Select columns from external
    external_cols = ['temperature_C', 'traffic_congestion_index', 'precipitation_mm', 'weather_condition', 'season', 'peak_hour']
    df_ext_sel = df_ext[[col for col in external_cols if col in df_ext.columns]]

    # Combine
    combined_df = pd.concat([df_log, df_ext_sel], axis=1)

    # Ensure no null values
    combined_df.dropna(inplace=True)

    # Ensure correct datatypes
    numerical_cols = ['Agent_Age', 'Agent_Rating', 'distance', 'Delivery_Time', 'temperature_C', 'traffic_congestion_index', 'precipitation_mm']
    for col in numerical_cols:
        if col in combined_df.columns:
            combined_df[col] = pd.to_numeric(combined_df[col], errors='coerce')

    # Apply SMOTE to balance the final dataset
    if 'delayed' in combined_df.columns:
        # Encode categorical for SMOTE
        from sklearn.preprocessing import LabelEncoder
        cat_cols = ['Weather', 'Traffic', 'Vehicle', 'Area', 'weather_condition', 'season']
        encoders = {}
        for col in cat_cols:
            if col in combined_df.columns:
                le = LabelEncoder()
                combined_df[col] = le.fit_transform(combined_df[col].astype(str))
                encoders[col] = le

        X = combined_df.drop('delayed', axis=1)
        y = combined_df['delayed']

        print(f"\nBefore final SMOTE: {y.value_counts().to_dict()}")

        smote = SMOTE(random_state=42)
        X_res, y_res = smote.fit_resample(X, y)

        combined_df = pd.DataFrame(X_res, columns=X.columns)
        combined_df['delayed'] = y_res

        # Decode categorical back
        for col, le in encoders.items():
            if col in combined_df.columns:
                combined_df[col] = le.inverse_transform(combined_df[col].astype(int))

        print(f"After final SMOTE: {combined_df['delayed'].value_counts().to_dict()}")

    print("\n=== FINAL CLEAN DATASET ===")
    print(f"Shape: {combined_df.shape}")
    print(f"Columns: {list(combined_df.columns)}")
    print(f"Null values: {combined_df.isnull().sum().sum()}")
    print(f"Data types:\n{combined_df.dtypes}")

    return combined_df

def save_cleaned_data(df):
    """Save cleaned dataset."""
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Datasets')
    output_path = os.path.join(output_dir, 'cleaned_logistics_combined.csv')
    df.to_csv(output_path, index=False)
    print(f"\n=== CLEANED DATA SAVED ===")
    print(f"Saved to: {output_path}")

def main():
    # Step 1: Load datasets
    df, df_ext = load_datasets()

    # Step 2: Handle missing values
    df, df_ext = handle_missing_values(df, df_ext)

    # Step 3: Standardize categorical
    df = standardize_categorical(df)

    # Step 4: Create target
    df = create_target_variable(df)

    # Step 5: Check class distribution (already printed in step 4)

    # Step 6: Handle imbalance (check only)
    df = handle_class_imbalance(df)

    # Step 7: Feature engineering
    df = feature_engineering(df)

    # Step 8: Final clean
    cleaned_df = final_clean_dataset(df, df_ext)

    # Step 9: Save
    save_cleaned_data(cleaned_df)

    print("\n=== DATA PREPARATION COMPLETE ===")
    print("Dataset is ready for model training!")

if __name__ == "__main__":
    main()