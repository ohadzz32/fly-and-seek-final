"""
=====================================================================
  FLIGHT PREDICTION API SERVER
  ----------------------------
  Flask microservice that wraps the trained Residual+Attention model
  and exposes it via REST API for real-time recursive prediction.

  Endpoints:
    POST /api/predict/feed         - Feed a data point to the buffer
    POST /api/predict/start        - Start recursive prediction
    POST /api/predict/step         - Get next recursive prediction step
    POST /api/predict/stop         - Stop prediction
    GET  /api/predict/status/<id>  - Get buffer/prediction status
    DELETE /api/predict/reset/<id> - Reset buffer
    GET  /health                   - Health check

  Run: python prediction_server.py
=====================================================================
"""

import os
import sys
import math
import threading
from collections import deque

import numpy as np
import joblib

# Suppress TF warnings
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

from flask import Flask, request, jsonify
from flask_cors import CORS

# =====================================================================
#  CONSTANTS
# =====================================================================
LOOK_BACK = 30
NUM_BASE_FEATURES = 9
NUM_ENG_FEATURES = 6
NUM_FEATURES = NUM_BASE_FEATURES + NUM_ENG_FEATURES  # 15
DEFAULT_DT = 10.0  # seconds between samples

# WGS84 ellipsoid parameters
WGS84_A = 6378137.0               # semi-major axis (m)
WGS84_B = 6356752.314245          # semi-minor axis (m)
WGS84_E2 = 0.00669437999014       # first eccentricity squared
WGS84_EP2 = 0.00673949674228      # second eccentricity squared

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# =====================================================================
#  CUSTOM LAYER (must be defined before model loading)
# =====================================================================
class BahdanauAttention(layers.Layer):
    """Bahdanau-style attention — learns which timesteps matter most."""
    def __init__(self, units=128, **kwargs):
        super().__init__(**kwargs)
        self.W = layers.Dense(units, use_bias=True)
        self.V = layers.Dense(1, use_bias=False)

    def call(self, values):
        score = self.V(tf.nn.tanh(self.W(values)))
        weights = tf.nn.softmax(score, axis=1)
        context = tf.reduce_sum(weights * values, axis=1)
        return context

    def get_config(self):
        return super().get_config()


# =====================================================================
#  LOAD MODEL & SCALERS
# =====================================================================
print("=" * 60)
print("  FLIGHT PREDICTION SERVER — Loading assets...")
print("=" * 60)

model = keras.models.load_model(
    os.path.join(BASE_DIR, "flight_residual_model.keras"),
    custom_objects={"BahdanauAttention": BahdanauAttention}
)
print("  [OK] Model loaded")

xyz_scaler = joblib.load(os.path.join(BASE_DIR, "xyz_scaler.pkl"))
feature_scaler = joblib.load(os.path.join(BASE_DIR, "feature_scaler.pkl"))
eng_scaler = joblib.load(os.path.join(BASE_DIR, "eng_scaler.pkl"))
print("  [OK] Scalers loaded (xyz, feature, eng)")

# Quick sanity check
_dummy = np.random.rand(1, LOOK_BACK, NUM_FEATURES).astype(np.float32)
_pred = model.predict(_dummy, verbose=0)
print(f"  [OK] Model test prediction shape: {_pred.shape}")
print("=" * 60)
print("  Assets ready. Starting server...")
print("=" * 60)


# =====================================================================
#  COORDINATE CONVERSION UTILITIES
# =====================================================================
def geodetic_to_ecef(lat_deg: float, lon_deg: float, alt_m: float):
    """Convert geodetic (lat°, lon°, alt_m) → ECEF (x, y, z) metres."""
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    sin_lon = math.sin(lon)
    cos_lon = math.cos(lon)

    N = WGS84_A / math.sqrt(1.0 - WGS84_E2 * sin_lat * sin_lat)

    x = (N + alt_m) * cos_lat * cos_lon
    y = (N + alt_m) * cos_lat * sin_lon
    z = (N * (1.0 - WGS84_E2) + alt_m) * sin_lat

    return x, y, z


def ecef_to_geodetic(x: float, y: float, z: float):
    """Convert ECEF (x, y, z) metres → geodetic (lat°, lon°, alt_m).
    Uses Bowring's iterative method.
    """
    lon = math.atan2(y, x)
    p = math.sqrt(x * x + y * y)

    # Initial estimate
    lat = math.atan2(z, p * (1.0 - WGS84_E2))

    for _ in range(10):
        sin_lat = math.sin(lat)
        N = WGS84_A / math.sqrt(1.0 - WGS84_E2 * sin_lat * sin_lat)
        lat = math.atan2(z + WGS84_E2 * N * sin_lat, p)

    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    N = WGS84_A / math.sqrt(1.0 - WGS84_E2 * sin_lat * sin_lat)

    if abs(cos_lat) > 1e-10:
        alt = p / cos_lat - N
    else:
        alt = abs(z) / abs(sin_lat) - N * (1.0 - WGS84_E2)

    return math.degrees(lat), math.degrees(lon), alt


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two (lat°, lon°) points."""
    R = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


# =====================================================================
#  PER-FLIGHT PREDICTOR STATE
# =====================================================================
class FlightPredictor:
    """Manages buffering and recursive prediction for a single flight."""

    def __init__(self, flight_id: str):
        self.flight_id = flight_id
        self.raw_buffer: deque = deque(maxlen=LOOK_BACK)
        self.is_predicting = False
        self.prediction_step = 0
        self.prediction_buffer = None           # (30, 15) scaled ndarray
        self.prediction_raw_list = None         # list of raw dicts for rebuild
        self.last_raw_ecef = None
        self.lock = threading.Lock()

    # ---------- properties ----------
    @property
    def buffer_ready(self) -> bool:
        return len(self.raw_buffer) >= LOOK_BACK

    @property
    def buffer_size(self) -> int:
        return len(self.raw_buffer)

    # ---------- buffer feeding ----------
    def add_observation(self, lat, lon, alt, velocity, heading_deg,
                        vertical_rate, timestamp):
        """Add a raw observation (from frontend) to the look-back buffer."""
        x, y, z = geodetic_to_ecef(lat, lon, alt)
        heading_sin = math.sin(math.radians(heading_deg))
        heading_cos = math.cos(math.radians(heading_deg))

        # dt from previous observation
        dt = DEFAULT_DT
        if len(self.raw_buffer) > 0:
            prev_ts = self.raw_buffer[-1]["timestamp"]
            diff = timestamp - prev_ts
            dt = max(diff, 0.1) if diff > 0 else DEFAULT_DT

        # acceleration from velocity diff
        acceleration = 0.0
        if len(self.raw_buffer) > 0:
            prev_vel = self.raw_buffer[-1]["velocity"]
            acceleration = (velocity - prev_vel) / dt

        obs = {
            "x": x, "y": y, "z": z,
            "velocity": velocity,
            "acceleration": acceleration,
            "heading_sin": heading_sin,
            "heading_cos": heading_cos,
            "vertical_rate": vertical_rate,
            "dt": dt,
            "timestamp": timestamp,
            "lat": lat, "lon": lon, "alt": alt,
            "heading_deg": heading_deg,
        }

        self.raw_buffer.append(obs)
        return {
            "bufferSize": len(self.raw_buffer),
            "bufferReady": self.buffer_ready,
            "samplesNeeded": max(0, LOOK_BACK - len(self.raw_buffer)),
        }

    # ---------- feature engineering & scaling ----------
    @staticmethod
    def _build_scaled_buffer(raw_list):
        """
        Build the (N, 15) scaled feature matrix from raw observations.
        Mirrors the training preprocessing exactly.
        """
        n = len(raw_list)

        # ---- base features (n, 9) ----
        base = np.zeros((n, NUM_BASE_FEATURES), dtype=np.float64)
        for i, obs in enumerate(raw_list):
            base[i] = [
                obs["x"], obs["y"], obs["z"],
                obs["velocity"], obs["acceleration"],
                obs["heading_sin"], obs["heading_cos"],
                obs["vertical_rate"], obs["dt"],
            ]

        scaled_base = feature_scaler.transform(base).astype(np.float32)

        # ---- engineered features (n, 6) ----
        eng_raw = np.zeros((n, NUM_ENG_FEATURES), dtype=np.float64)
        for i in range(1, n):
            dt_safe = max(raw_list[i]["dt"], 0.1)

            # vx, vy, vz  (ECEF velocity components)
            eng_raw[i, 0] = (raw_list[i]["x"] - raw_list[i - 1]["x"]) / dt_safe
            eng_raw[i, 1] = (raw_list[i]["y"] - raw_list[i - 1]["y"]) / dt_safe
            eng_raw[i, 2] = (raw_list[i]["z"] - raw_list[i - 1]["z"]) / dt_safe

            # jerk  (d(acceleration)/dt)
            eng_raw[i, 3] = (
                raw_list[i]["acceleration"] - raw_list[i - 1]["acceleration"]
            ) / dt_safe

            # delta_heading  (angular rate, wrapped to [-π, +π])
            h_i = math.atan2(raw_list[i]["heading_sin"],
                             raw_list[i]["heading_cos"])
            h_prev = math.atan2(raw_list[i - 1]["heading_sin"],
                                raw_list[i - 1]["heading_cos"])
            dh = h_i - h_prev
            dh = (dh + math.pi) % (2.0 * math.pi) - math.pi
            eng_raw[i, 4] = dh

            # vertical_acceleration  (d(vertical_rate)/dt)
            eng_raw[i, 5] = (
                raw_list[i]["vertical_rate"] - raw_list[i - 1]["vertical_rate"]
            ) / dt_safe

        # Index 0 stays zero — matches training code for first-in-group

        scaled_eng = eng_scaler.transform(eng_raw).astype(np.float32)

        return np.hstack([scaled_base, scaled_eng])

    # ---------- prediction lifecycle ----------
    def start_prediction(self):
        """Snapshot current buffer and enter recursive prediction mode."""
        if not self.buffer_ready:
            return None

        raw_list = list(self.raw_buffer)
        self.prediction_buffer = self._build_scaled_buffer(raw_list)
        self.prediction_raw_list = list(raw_list)
        self.last_raw_ecef = np.array(
            [raw_list[-1]["x"], raw_list[-1]["y"], raw_list[-1]["z"]]
        )
        self.prediction_step = 0
        self.is_predicting = True

        last = raw_list[-1]
        return {
            "latitude": last["lat"],
            "longitude": last["lon"],
            "altitude": last["alt"],
            "step": 0,
        }

    def predict_next_step(self):
        """Run one recursive prediction step and return the result."""
        if not self.is_predicting or self.prediction_buffer is None:
            return None

        # --- model inference ---
        X = self.prediction_buffer[np.newaxis, :, :]  # (1, 30, 15)
        delta_pred = model.predict(X, verbose=0)[0]    # (3,)

        # last scaled xyz (columns 0-2 are xyz in feature_scaler space)
        last_scaled_xyz = self.prediction_buffer[-1, :3].copy()

        # new scaled xyz
        new_scaled_xyz = last_scaled_xyz + delta_pred

        # inverse-transform to raw ECEF using xyz_scaler
        new_ecef_raw = xyz_scaler.inverse_transform(
            new_scaled_xyz.reshape(1, 3)
        )[0]

        # convert to geodetic
        new_lat, new_lon, new_alt = ecef_to_geodetic(
            float(new_ecef_raw[0]),
            float(new_ecef_raw[1]),
            float(new_ecef_raw[2]),
        )

        # build new raw observation (carry-forward non-predicted fields)
        last_obs = self.prediction_raw_list[-1]
        new_obs = {
            "x": float(new_ecef_raw[0]),
            "y": float(new_ecef_raw[1]),
            "z": float(new_ecef_raw[2]),
            "velocity": last_obs["velocity"],
            "acceleration": last_obs["acceleration"],
            "heading_sin": last_obs["heading_sin"],
            "heading_cos": last_obs["heading_cos"],
            "vertical_rate": last_obs["vertical_rate"],
            "dt": DEFAULT_DT,
            "timestamp": last_obs["timestamp"] + DEFAULT_DT,
            "lat": new_lat,
            "lon": new_lon,
            "alt": new_alt,
            "heading_deg": last_obs["heading_deg"],
        }

        # shift raw list (sliding window)
        self.prediction_raw_list.append(new_obs)
        if len(self.prediction_raw_list) > LOOK_BACK:
            self.prediction_raw_list = self.prediction_raw_list[-LOOK_BACK:]

        # rebuild scaled buffer
        self.prediction_buffer = self._build_scaled_buffer(
            self.prediction_raw_list
        )
        self.last_raw_ecef = new_ecef_raw
        self.prediction_step += 1

        return {
            "latitude": new_lat,
            "longitude": new_lon,
            "altitude": new_alt,
            "step": self.prediction_step,
            "ecef": {
                "x": float(new_ecef_raw[0]),
                "y": float(new_ecef_raw[1]),
                "z": float(new_ecef_raw[2]),
            },
        }

    def stop_prediction(self):
        """Exit recursive mode."""
        total = self.prediction_step
        self.is_predicting = False
        self.prediction_step = 0
        self.prediction_buffer = None
        self.prediction_raw_list = None
        return {"stopped": True, "totalSteps": total}

    def reset(self):
        """Clear everything."""
        self.raw_buffer.clear()
        self.stop_prediction()


# =====================================================================
#  GLOBAL STATE
# =====================================================================
flight_predictors: dict[str, FlightPredictor] = {}
predictors_lock = threading.Lock()


def get_predictor(flight_id: str) -> FlightPredictor:
    with predictors_lock:
        if flight_id not in flight_predictors:
            flight_predictors[flight_id] = FlightPredictor(flight_id)
        return flight_predictors[flight_id]


# =====================================================================
#  FLASK APP
# =====================================================================
app = Flask(__name__)
CORS(app)


@app.route("/api/predict/feed", methods=["POST"])
def feed_observation():
    """Feed a single data point into a flight's buffer."""
    data = request.json
    fid = data.get("flightId")
    if not fid:
        return jsonify({"error": "flightId required"}), 400

    predictor = get_predictor(fid)
    with predictor.lock:
        result = predictor.add_observation(
            lat=data.get("latitude", 0),
            lon=data.get("longitude", 0),
            alt=data.get("altitude", 10000),
            velocity=data.get("velocity", 0),
            heading_deg=data.get("heading", 0),
            vertical_rate=data.get("verticalRate", 0),
            timestamp=data.get("timestamp", 0),
        )
    return jsonify(result)


@app.route("/api/predict/start", methods=["POST"])
def start_prediction():
    """Start recursive prediction for a flight (buffer must be full)."""
    data = request.json
    fid = data.get("flightId")
    if not fid:
        return jsonify({"error": "flightId required"}), 400

    predictor = get_predictor(fid)
    with predictor.lock:
        result = predictor.start_prediction()

    if result is None:
        return jsonify({
            "error": "Buffer not ready",
            "bufferSize": predictor.buffer_size,
        }), 400

    return jsonify({"started": True, **result})


@app.route("/api/predict/step", methods=["POST"])
def predict_step():
    """Run one recursive prediction step and return predicted position."""
    data = request.json
    fid = data.get("flightId")
    if not fid:
        return jsonify({"error": "flightId required"}), 400

    predictor = get_predictor(fid)
    with predictor.lock:
        result = predictor.predict_next_step()

    if result is None:
        return jsonify({"error": "Prediction not started"}), 400

    return jsonify(result)


@app.route("/api/predict/stop", methods=["POST"])
def stop_prediction():
    """Stop recursive prediction."""
    data = request.json
    fid = data.get("flightId")
    if not fid:
        return jsonify({"error": "flightId required"}), 400

    predictor = get_predictor(fid)
    with predictor.lock:
        result = predictor.stop_prediction()
    return jsonify(result)


@app.route("/api/predict/status/<flight_id>", methods=["GET"])
def get_status(flight_id):
    """Get buffer and prediction status for a flight."""
    predictor = get_predictor(flight_id)
    return jsonify({
        "flightId": flight_id,
        "bufferSize": predictor.buffer_size,
        "bufferReady": predictor.buffer_ready,
        "isPredicting": predictor.is_predicting,
        "predictionStep": predictor.prediction_step,
        "samplesNeeded": max(0, LOOK_BACK - predictor.buffer_size),
    })


@app.route("/api/predict/reset/<flight_id>", methods=["DELETE"])
def reset_buffer(flight_id):
    """Clear all state for a flight."""
    predictor = get_predictor(flight_id)
    with predictor.lock:
        predictor.reset()
    return jsonify({"reset": True})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "modelLoaded": True})


# =====================================================================
if __name__ == "__main__":
    print("\n  Prediction server starting on http://localhost:5000")
    print("  Endpoints:")
    print("    POST /api/predict/feed")
    print("    POST /api/predict/start")
    print("    POST /api/predict/step")
    print("    POST /api/predict/stop")
    print("    GET  /api/predict/status/<flightId>")
    print("    DELETE /api/predict/reset/<flightId>")
    print("    GET  /health\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
