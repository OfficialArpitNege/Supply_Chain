import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import warnings

import joblib
import numpy as np

from Backend.services.fallback_logic import predict_delay_fallback, predict_demand_fallback

logger = logging.getLogger(__name__)


class ModelService:
    def __init__(self, models_dir: str = "models") -> None:
        self.models_dir = models_dir
        self.delay_model = None
        self.demand_model = None
        self.encoders = None
        self.scaler = None
        self.delay_threshold = 0.3
        self.metadata = None
        self.load_all_artifacts()

    def _workspace_root(self) -> Path:
        return Path(__file__).resolve().parents[2]

    def _candidate_dirs(self) -> List[Path]:
        candidates = []
        explicit_dir = Path(self.models_dir)
        if explicit_dir.is_absolute():
            candidates.append(explicit_dir)
        else:
            candidates.append((Path(__file__).resolve().parents[1] / self.models_dir).resolve())
            candidates.append((self._workspace_root() / self.models_dir).resolve())

        candidates.append((self._workspace_root() / "ML_Model" / "models").resolve())
        candidates.append((Path(__file__).resolve().parents[1] / "models").resolve())

        unique_candidates = []
        seen = set()
        for candidate in candidates:
            normalized = str(candidate.resolve())
            if normalized not in seen:
                seen.add(normalized)
                unique_candidates.append(candidate)
        return unique_candidates

    def _first_existing(self, filenames: List[str]) -> Optional[Path]:
        for directory in self._candidate_dirs():
            for filename in filenames:
                path = directory / filename
                if path.exists():
                    return path
        return None

    def _safe_load_joblib(self, filenames: List[str], label: str) -> Any:
        path = self._first_existing(filenames)
        if path is None:
            logger.warning("%s not found; tried %s", label, ", ".join(filenames))
            return None

        try:
            return joblib.load(path)
        except Exception as exc:
            logger.warning("Failed to load %s from %s (%s): %r", label, path, type(exc).__name__, exc)
            return None

    def _safe_load_json(self, filenames: List[str]) -> Optional[Dict[str, Any]]:
        path = self._first_existing(filenames)
        if path is None:
            return None

        try:
            with open(path, "r", encoding="utf-8") as handle:
                return json.load(handle)
        except Exception as exc:
            logger.warning("Failed to load metadata from %s (%s): %r", path, type(exc).__name__, exc)
            return None

    def load_all_artifacts(self) -> None:
        logger.info("Loading models from %s and fallback production artifact locations", self.models_dir)

        self.delay_model = self._safe_load_joblib(
            ["delay_model_final.pkl", "delay_model_v2.pkl", "delay_model.pkl", "delay_model_fixed.pkl"],
            "delay model",
        )
        self.demand_model = self._safe_load_joblib(
            ["demand_model_final.pkl", "demand_model_v2.pkl", "demand_model.pkl"],
            "demand model",
        )
        self.encoders = self._safe_load_joblib(
            ["encoders.pkl", "encoders_final.pkl", "delay_encoders_fixed.pkl"],
            "encoders",
        )
        self.scaler = self._safe_load_joblib(
            ["scaler.pkl", "delay_scaler.pkl"],
            "scaler",
        )

        threshold_value = self._safe_load_joblib(
            ["delay_threshold.pkl", "delay_threshold_fixed.pkl"],
            "delay threshold",
        )
        if threshold_value is not None:
            try:
                self.delay_threshold = float(threshold_value)
            except (TypeError, ValueError):
                self.delay_threshold = 0.3

        self.metadata = self._safe_load_json(["metadata.json"])
        if isinstance(self.metadata, dict) and "threshold_value" in self.metadata:
            try:
                self.delay_threshold = float(self.metadata["threshold_value"])
            except (TypeError, ValueError):
                pass

        if self.delay_model is None or self.demand_model is None:
            logger.warning("One or more production models are unavailable; fallback paths will be used.")
        else:
            logger.info("Production models loaded successfully.")

    def _encoder_classes(self, encoder_name: str) -> List[str]:
        if not isinstance(self.encoders, dict) or encoder_name not in self.encoders:
            return []

        encoder = self.encoders[encoder_name]
        classes = getattr(encoder, "classes_", [])
        return [str(item) for item in classes]

    def _pick_encoder_value(self, encoder_name: str, candidates: List[str], fallback_index: int = 0) -> str:
        classes = self._encoder_classes(encoder_name)
        if not classes:
            return candidates[0]

        for candidate in candidates:
            if candidate in classes:
                return candidate

        if 0 <= fallback_index < len(classes):
            return classes[fallback_index]

        return classes[0]

    def _encode_category_value(self, encoder_name: str, raw_value: Any, fallback: str) -> int:
        classes = self._encoder_classes(encoder_name)
        if not classes:
            return 0

        value = str(raw_value).strip()
        if value in classes:
            chosen = value
        else:
            chosen = fallback if fallback in classes else classes[0]

        encoder = self.encoders[encoder_name]
        return int(encoder.transform([chosen])[0])

    def _normalize_vehicle_for_delay(self, value: Any) -> str:
        raw = str(value or "").strip().lower()
        if raw in {"bike", "bicycle"}:
            candidates = ["scooter ", "motorcycle ", "van"]
        elif raw in {"car"}:
            candidates = ["van", "scooter ", "motorcycle "]
        elif raw in {"truck"}:
            candidates = ["van", "motorcycle ", "scooter "]
        elif raw in {"scooter", "motorbike", "motorcycle"}:
            candidates = ["motorcycle ", "scooter ", "van"]
        else:
            candidates = ["scooter ", "motorcycle ", "van"]
        return self._pick_encoder_value("Vehicle", candidates)

    def _normalize_area_for_delay(self, value: Any) -> str:
        raw = str(value or "").strip().lower()
        if raw in {"urban"}:
            candidates = ["Urban ", "Semi-Urban ", "Metropolitian ", "Other"]
        elif raw in {"semi-urban", "semi urban"}:
            candidates = ["Semi-Urban ", "Urban ", "Metropolitian ", "Other"]
        elif raw in {"metro", "metropolitan", "metropolitian"}:
            candidates = ["Metropolitian ", "Urban ", "Semi-Urban ", "Other"]
        else:
            candidates = ["Other", "Urban ", "Semi-Urban ", "Metropolitian "]
        return self._pick_encoder_value("Area", candidates)

    def _normalize_weather_for_delay(self, value: Any) -> str:
        raw = str(value or "").strip().lower()
        if raw in {"fog", "mist", "haze", "smoke"}:
            candidates = ["Fog", "Cloudy", "Windy"]
        elif raw in {"clear", "clear sky", "sunny"}:
            candidates = ["Sunny", "Cloudy", "Windy"]
        elif raw in {"rain", "rainy", "drizzle"}:
            candidates = ["Cloudy", "Stormy", "Sunny"]
        elif raw in {"storm", "stormy", "thunderstorm"}:
            candidates = ["Stormy", "Cloudy", "Windy"]
        elif raw in {"wind", "windy"}:
            candidates = ["Windy", "Cloudy", "Sunny"]
        elif raw in {"sand", "sandstorm", "sandstorms"}:
            candidates = ["Sandstorms", "Cloudy", "Windy"]
        else:
            candidates = ["Sunny", "Cloudy", "Fog"]
        return self._pick_encoder_value("Weather", candidates)

    def _normalize_weather_condition(self, value: Any, fallback_weather: Any) -> str:
        raw = str(value or fallback_weather or "").strip().lower()
        if raw in {"clear", "sunny", "clear sky"}:
            candidates = ["Clear", "Cloudy", "Rain"]
        elif raw in {"fog", "mist", "haze", "smoke"}:
            candidates = ["Fog", "Cloudy", "Clear"]
        elif raw in {"rain", "rainy", "drizzle"}:
            candidates = ["Rain", "Cloudy", "Storm"]
        elif raw in {"storm", "stormy", "thunderstorm"}:
            candidates = ["Storm", "Cloudy", "Rain"]
        elif raw in {"snow"}:
            candidates = ["Snow", "Cloudy", "Fog"]
        else:
            candidates = ["Cloudy", "Clear", "Rain"]
        return self._pick_encoder_value("weather_condition", candidates)

    def _normalize_traffic_for_delay(self, value: Any) -> str:
        raw = str(value or "").strip().lower()
        if raw in {"low"}:
            candidates = ["Low ", "Medium ", "High "]
        elif raw in {"medium", "moderate"}:
            candidates = ["Medium ", "Low ", "High "]
        elif raw in {"high", "heavy"}:
            candidates = ["High ", "Medium ", "Low "]
        else:
            candidates = ["Medium ", "Low ", "High "]
        return self._pick_encoder_value("Traffic", candidates)

    def _season_from_value(self, data_dict: Dict[str, Any]) -> str:
        season_value = data_dict.get("season")
        if season_value:
            raw = str(season_value).strip().lower()
            if raw in {"autumn", "fall"}:
                return self._pick_encoder_value("season", ["Autumn", "Spring", "Summer", "Winter"])
            if raw in {"spring"}:
                return self._pick_encoder_value("season", ["Spring", "Summer", "Autumn", "Winter"])
            if raw in {"summer"}:
                return self._pick_encoder_value("season", ["Summer", "Spring", "Autumn", "Winter"])
            if raw in {"winter"}:
                return self._pick_encoder_value("season", ["Winter", "Autumn", "Spring", "Summer"])

        timestamp = data_dict.get("timestamp")
        month = None
        if timestamp not in (None, ""):
            normalized = str(timestamp).replace("Z", "+00:00")
            try:
                month = datetime.fromisoformat(normalized).month
            except ValueError:
                month = None

        if month in (12, 1, 2):
            return self._pick_encoder_value("season", ["Winter", "Autumn", "Spring", "Summer"])
        if month in (3, 4, 5):
            return self._pick_encoder_value("season", ["Spring", "Summer", "Autumn", "Winter"])
        if month in (6, 7, 8):
            return self._pick_encoder_value("season", ["Summer", "Spring", "Autumn", "Winter"])
        if month in (9, 10, 11):
            return self._pick_encoder_value("season", ["Autumn", "Spring", "Summer", "Winter"])

        return self._pick_encoder_value("season", ["Summer", "Spring", "Autumn", "Winter"])

    def _parse_timestamp(self, value: Any) -> Optional[datetime]:
        if value in (None, ""):
            return None
        normalized = str(value).replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None

    def preprocess_features(self, data_dict: Dict[str, Any]) -> np.ndarray:
        if self.delay_model is None:
            raise RuntimeError("Delay model is not available.")

        timestamp = self._parse_timestamp(data_dict.get("timestamp"))
        hour_of_day = data_dict.get("hour_of_day")
        weekday = data_dict.get("weekday")
        if hour_of_day is None and timestamp is not None:
            hour_of_day = timestamp.hour
        if weekday is None and timestamp is not None:
            weekday = timestamp.weekday()

        peak_hour = data_dict.get("peak_hour")
        if peak_hour is None:
            peak_hour = 1 if int(hour_of_day or 0) in {8, 9, 10, 17, 18, 19, 20} else 0

        distance = data_dict.get("distance")
        if distance in (None, ""):
            distance = 5.0

        numeric_features = {
            "Agent_Age": float(data_dict.get("Agent_Age", 30)),
            "Agent_Rating": float(data_dict.get("Agent_Rating", 4.5)),
            "distance": float(distance),
            "hour_of_day": float(hour_of_day if hour_of_day is not None else 12),
            "temperature_C": float(data_dict.get("temperature_C", 30)),
            "traffic_congestion_index": float(data_dict.get("traffic_congestion_index", 0.5)),
            "precipitation_mm": float(data_dict.get("precipitation_mm", 0.0)),
        }

        categorical_features = {
            "Weather_encoded": float(self._encode_category_value("Weather", self._normalize_weather_for_delay(data_dict.get("weather")), "Sunny")),
            "Traffic_encoded": float(self._encode_category_value("Traffic", self._normalize_traffic_for_delay(data_dict.get("traffic")), "Medium ")),
            "Vehicle_encoded": float(self._encode_category_value("Vehicle", self._normalize_vehicle_for_delay(data_dict.get("vehicle")), "scooter ")),
            "Area_encoded": float(self._encode_category_value("Area", self._normalize_area_for_delay(data_dict.get("area")), "Urban ")),
            "weather_condition_encoded": float(self._encode_category_value("weather_condition", self._normalize_weather_condition(data_dict.get("weather_condition"), data_dict.get("weather")), "Clear")),
            "peak_hour": float(int(peak_hour)),
            "weekday": float(int(weekday if weekday is not None else 0)),
            "season_encoded": float(self._encode_category_value("season", self._season_from_value(data_dict), "Summer")),
        }

        numeric_order = [
            "Agent_Age",
            "Agent_Rating",
            "distance",
            "hour_of_day",
            "temperature_C",
            "traffic_congestion_index",
            "precipitation_mm",
        ]

        categorical_order = [
            "Weather_encoded",
            "Traffic_encoded",
            "Vehicle_encoded",
            "Area_encoded",
            "weather_condition_encoded",
            "peak_hour",
            "weekday",
            "weekday",
            "season_encoded",
        ]

        numeric_values = np.array([[numeric_features[name] for name in numeric_order]], dtype=float)
        if self.scaler is not None:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    numeric_values = self.scaler.transform(numeric_values)
            except Exception as exc:
                logger.warning("Scaler transform failed (%s): %r", type(exc).__name__, exc)

        categorical_values = np.array([[categorical_features[name] for name in categorical_order]], dtype=float)
        return np.concatenate([numeric_values, categorical_values], axis=1)

    def predict_delay_model(self, data_dict: Dict[str, Any]) -> Dict[str, Any]:
        if self.delay_model is None:
            return {"delay": None, "confidence": 0.0}

        features = self.preprocess_features(data_dict)

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                if hasattr(self.delay_model, "predict_proba"):
                    probabilities = self.delay_model.predict_proba(features)[0]
                else:
                    predicted_class = int(self.delay_model.predict(features)[0])
                    prob_delayed = 1.0 if predicted_class == 1 else 0.0
                    prob_ontime = 1.0 - prob_delayed
                    prediction = 1 if prob_delayed > self.delay_threshold else 0
                    confidence = max(prob_ontime, prob_delayed)

                    return {
                        "delay": int(prediction),
                        "confidence": float(confidence),
                        "probability_on_time": float(prob_ontime),
                        "probability_delayed": float(prob_delayed),
                        "threshold_used": float(self.delay_threshold),
                    }

                prob_delayed = float(probabilities[1]) if len(probabilities) > 1 else float(probabilities[0])
                prob_delayed = float(probabilities[1]) if len(probabilities) > 1 else float(probabilities[0])
                prob_ontime = float(probabilities[0]) if len(probabilities) > 1 else float(1.0 - probabilities[0])

            prediction = 1 if prob_delayed > self.delay_threshold else 0
            confidence = max(prob_ontime, prob_delayed)

            return {
                "delay": int(prediction),
                "confidence": float(confidence),
                "probability_on_time": float(prob_ontime),
                "probability_delayed": float(prob_delayed),
                "threshold_used": float(self.delay_threshold),
            }
        except Exception as exc:
            logger.warning("Delay prediction failed (%s): %r", type(exc).__name__, exc)
            return {"delay": None, "confidence": 0.0}

    def predict_demand_model(self, data_dict: Dict[str, Any]) -> Dict[str, Any]:
        if self.demand_model is None:
            return {"predicted_demand": None}

        try:
            order_date = str(data_dict.get("order_date", "")).strip()
            if not order_date:
                raise ValueError("order_date is required for demand prediction")
            order_date_value = datetime.strptime(order_date.split("T", 1)[0], "%Y-%m-%d")

            category_encoder = self.encoders.get("category") if isinstance(self.encoders, dict) else None
            if category_encoder is None:
                raise RuntimeError("category encoder not available")

            category_candidates = self._category_candidates(data_dict.get("category"))
            encoded_category = self._encode_with_candidates(category_encoder, category_candidates)

            features = np.array(
                [[
                    float(data_dict.get("product_id", 0)),
                    float(encoded_category),
                    float(order_date_value.month),
                    float(order_date_value.day),
                    float(order_date_value.weekday()),
                ]],
                dtype=float,
            )

            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                prediction = self.demand_model.predict(features)[0]
            return {"predicted_demand": float(prediction)}
        except Exception as exc:
            logger.warning("Demand prediction failed (%s): %r", type(exc).__name__, exc)
            return {"predicted_demand": None}

    def _category_candidates(self, raw_value: Any) -> List[str]:
        value = str(raw_value or "").strip().lower()
        if value in {"grocery", "groceries", "grocery & staples", "staples"}:
            return ["Grocery & Staples", "Snacks & Munchies", "Baby Care"]
        if value in {"pharma", "pharmacy", "medicine", "medical"}:
            return ["Pharmacy", "Baby Care", "Personal Care"]
        if value in {"snack", "snacks", "snacks & munchies"}:
            return ["Snacks & Munchies", "Grocery & Staples", "Cold Drinks & Juices"]
        if value in {"dairy", "breakfast", "dairy & breakfast"}:
            return ["Dairy & Breakfast", "Grocery & Staples", "Baby Care"]
        if value in {"fruit", "vegetable", "vegetables", "fruits & vegetables"}:
            return ["Fruits & Vegetables", "Grocery & Staples", "Household Care"]
        if value in {"household", "household care"}:
            return ["Household Care", "Personal Care", "Grocery & Staples"]
        if value in {"frozen", "instant", "instant & frozen food"}:
            return ["Instant & Frozen Food", "Grocery & Staples", "Snacks & Munchies"]
        if value in {"personal", "personal care"}:
            return ["Personal Care", "Pharmacy", "Baby Care"]
        if value in {"pet", "pet care"}:
            return ["Pet Care", "Household Care", "Personal Care"]
        if value in {"cold drinks", "juices", "cold drinks & juices"}:
            return ["Cold Drinks & Juices", "Snacks & Munchies", "Grocery & Staples"]
        return [
            str(raw_value or "Grocery & Staples").strip().title(),
            "Grocery & Staples",
            "Baby Care",
        ]

    def _encode_with_candidates(self, encoder: Any, candidates: List[str]) -> int:
        classes = [str(value) for value in getattr(encoder, "classes_", [])]
        chosen = None
        for candidate in candidates:
            if candidate in classes:
                chosen = candidate
                break

        if chosen is None:
            chosen = classes[0] if classes else candidates[0]

        return int(encoder.transform([chosen])[0])

    def predict_delay(self, data_dict: Dict[str, Any]) -> Dict[str, Any]:
        if self.delay_model is not None:
            result = self.predict_delay_model(data_dict)
            if result.get("delay") is not None and float(result.get("confidence", 0.0)) >= 0.6:
                fallback_result = predict_delay_fallback(data_dict)
                if int(result["delay"]) != int(fallback_result["delay"]):
                    if float(result["confidence"]) >= 0.96:
                        return {"delay": int(result["delay"]), "confidence": float(result["confidence"])}

                    return {
                        "delay": int(fallback_result["delay"]),
                        "confidence": float(fallback_result["confidence"]),
                    }

                return {"delay": int(result["delay"]), "confidence": float(result["confidence"])}

        fallback_result = predict_delay_fallback(data_dict)
        return {
            "delay": int(fallback_result["delay"]),
            "confidence": float(fallback_result["confidence"]),
        }

    def predict_demand(self, data_dict: Dict[str, Any]) -> Dict[str, Any]:
        if self.demand_model is not None:
            result = self.predict_demand_model(data_dict)
            if result.get("predicted_demand") is not None:
                return {"predicted_demand": float(result["predicted_demand"])}

        fallback_result = predict_demand_fallback(data_dict)
        return {"predicted_demand": float(fallback_result["predicted_demand"])}

    def health_check(self) -> Dict[str, Any]:
        checks = {
            "delay_model": self.delay_model is not None,
            "demand_model": self.demand_model is not None,
            "encoders": self.encoders is not None,
            "scaler": self.scaler is not None,
            "threshold": self.delay_threshold is not None,
            "metadata": self.metadata is not None,
        }

        all_ok = all(checks.values())
        return {
            "status": "healthy" if all_ok else "unhealthy",
            "checks": checks,
            "encoders_count": len(self.encoders) if isinstance(self.encoders, dict) else 0,
            "threshold_value": float(self.delay_threshold) if self.delay_threshold is not None else None,
            "artifacts_dir": self.models_dir,
        }


model_service = ModelService(models_dir="models")


def predict_delay(data_dict: Dict[str, Any]) -> Dict[str, Any]:
    return model_service.predict_delay(data_dict)


def predict_demand(data_dict: Dict[str, Any]) -> Dict[str, Any]:
    return model_service.predict_demand(data_dict)


def health_check() -> Dict[str, Any]:
    return model_service.health_check()
