import logging
from pathlib import Path
from typing import Any, Dict, Optional

import joblib

from Backend.services.fallback_logic import predict_delay_fallback, predict_demand_fallback

logger = logging.getLogger(__name__)


def _first_existing(candidates):
    for path in candidates:
        if path.exists():
            return path
    return None


_BASE_DIR = Path(__file__).resolve().parents[1]
_MODELS_DIR = _BASE_DIR / "models"
_WORKSPACE_DIR = _BASE_DIR.parent
_ML_MODEL_DIR = _WORKSPACE_DIR / "ML_Model"

_delay_model_path = _first_existing(
    [
        _MODELS_DIR / "delay_model_v2.pkl",
        _MODELS_DIR / "delay_model.pkl",
        _ML_MODEL_DIR / "delay_model_fixed.pkl",
        _ML_MODEL_DIR / "delay_model.pkl",
    ]
)

_demand_model_path = _first_existing(
    [
        _MODELS_DIR / "demand_model_v2.pkl",
        _MODELS_DIR / "demand_model.pkl",
        _ML_MODEL_DIR / "demand_model.pkl",
    ]
)

_scaler_path = _first_existing(
    [
        _MODELS_DIR / "scaler.pkl",
        _ML_MODEL_DIR / "delay_scaler.pkl",
        _ML_MODEL_DIR / "scaler.pkl",
    ]
)

_encoder_path = _first_existing(
    [
        _MODELS_DIR / "encoder.pkl",
        _ML_MODEL_DIR / "encoder.pkl",
    ]
)


delay_model = None
demand_model = None
scaler = None
encoder = None

DELAY_MODEL_READY = False
DEMAND_MODEL_READY = False
MODEL_READY = False

def _safe_load(path: Optional[Path], label: str) -> Any:
    if path is None:
        logger.info("%s not found; skipping.", label)
        return None

    try:
        return joblib.load(path)
    except Exception as exc:
        logger.warning(
            "Failed to load %s from %s (%s): %r",
            label,
            path,
            type(exc).__name__,
            exc,
        )
        return None


delay_model = _safe_load(_delay_model_path, "delay model")
demand_model = _safe_load(_demand_model_path, "demand model")
scaler = _safe_load(_scaler_path, "scaler")
encoder = _safe_load(_encoder_path, "encoder")

DELAY_MODEL_READY = delay_model is not None
DEMAND_MODEL_READY = demand_model is not None
MODEL_READY = DELAY_MODEL_READY or DEMAND_MODEL_READY


def _as_2d(features: Any) -> Any:
    if isinstance(features, list):
        if not features:
            return [features]
        if isinstance(features[0], list):
            return features
        return [features]
    return features


def transform_features(features: Any) -> Any:
    transformed = _as_2d(features)

    if encoder is not None:
        try:
            transformed = encoder.transform(transformed)
        except Exception:
            # Some models are already trained on encoded/raw features; keep input as-is.
            pass

    if scaler is not None:
        try:
            transformed = scaler.transform(transformed)
        except Exception:
            # Scaler may not match the provided feature vector shape.
            pass

    return transformed


def predict_delay_model(features: Any) -> Dict[str, Any]:
    if not DELAY_MODEL_READY:
        return {"delay": None, "confidence": 0.0}

    transformed = transform_features(features)

    try:
        if hasattr(delay_model, "predict_proba"):
            proba = delay_model.predict_proba(transformed)[0]
            if len(proba) > 1:
                prob = float(proba[1])
            else:
                prob = float(proba[0])
        else:
            pred_no_proba = int(delay_model.predict(transformed)[0])
            prob = 1.0 if pred_no_proba == 1 else 0.0

        pred = 1 if prob > 0.6 else 0
        return {
            "delay": int(pred),
            "confidence": float(prob),
        }
    except Exception:
        return {"delay": None, "confidence": 0.0}


def predict_demand_model(features: Any) -> Dict[str, Any]:
    if not DEMAND_MODEL_READY:
        return {"predicted_demand": None}

    transformed = transform_features(features)

    try:
        pred = demand_model.predict(transformed)
        return {
            "predicted_demand": float(pred[0]),
        }
    except Exception:
        return {"predicted_demand": None}


def fallback_delay(data: Dict[str, Any]) -> Dict[str, Any]:
    if data.get("traffic") == "High" and data.get("weather") in ["Rain", "Fog"]:
        return {"delay": 1, "confidence": 0.7}

    return {"delay": 0, "confidence": 0.5}


def predict_delay(features: Any, data: Dict[str, Any]) -> Dict[str, Any]:
    if DELAY_MODEL_READY:
        result = predict_delay_model(features)

        if result.get("delay") is None:
            return fallback_delay(data)

        if float(result.get("confidence", 0.0)) < 0.6:
            return fallback_delay(data)

        return result

    return fallback_delay(data)


def predict_demand(features: Any, data: Dict[str, Any]) -> Dict[str, Any]:
    if DEMAND_MODEL_READY:
        result = predict_demand_model(features)
        if result.get("predicted_demand") is not None:
            return result

    return predict_demand_fallback(data)
