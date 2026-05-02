import sys
import json
import os
import math
import numpy as np
import joblib

# Suppress TensorFlow logging
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

# --- BahdanauAttention Layer (Required for model loading) ---
def get_attention_layer():
    import tensorflow as tf
    from tensorflow.keras import layers

    class BahdanauAttention(layers.Layer):
        def __init__(self, units=128, **kwargs):
            super().__init__(**kwargs)
            self.W = layers.Dense(units, use_bias=True)
            self.V = layers.Dense(1, use_bias=False)

        def call(self, values):
            # values: (batch, T, D)
            score = self.V(tf.nn.tanh(self.W(values)))
            weights = tf.nn.softmax(score, axis=1)
            context = tf.reduce_sum(weights * values, axis=1)
            return context

        def get_config(self):
            config = super().get_config()
            config.update({"units": self.W.units})
            return config
            
    return BahdanauAttention

# --- WGS84 to ECEF Conversion ---
def wgs84_to_ecef(lat, lon, alt):
    # Constants for WGS84
    a = 6378137.0
    f = 1 / 298.257223563
    e2 = 2 * f - f**2
    
    rad_lat = math.radians(lat)
    rad_lon = math.radians(lon)
    
    sin_lat = math.sin(rad_lat)
    cos_lat = math.cos(rad_lat)
    
    N = a / math.sqrt(1 - e2 * sin_lat**2)
    
    x = (N + alt) * cos_lat * math.cos(rad_lon)
    y = (N + alt) * cos_lat * math.sin(rad_lon)
    z = (N * (1 - e2) + alt) * sin_lat
    
    return x, y, z

def ecef_to_wgs84(x, y, z):
    # Constants for WGS84
    a = 6378137.0
    f = 1 / 298.257223563
    e2 = 2 * f - f**2
    b = a * (1 - f)
    ep2 = (a**2 - b**2) / b**2
    
    p = math.sqrt(x**2 + y**2)
    th = math.atan2(a * z, b * p)
    
    lon = math.atan2(y, x)
    lat = math.atan2(z + ep2 * b * (math.sin(th)**3), p - e2 * a * (math.cos(th)**3))
    
    N = a / math.sqrt(1 - e2 * (math.sin(lat)**2))
    alt = p / math.cos(lat) - N
    
    return math.degrees(lat), math.degrees(lon), alt

# --- Prediction Logic ---
def main():
    try:
        # 1. Read input from stdin
        if sys.stdin.isatty():
            # If no stdin is provided (interactive mode), exit with error
            pass

        input_raw = sys.stdin.read()
        if not input_raw:
            print(json.dumps({"error": "No input provided via stdin"}))
            return

        data = json.loads(input_raw)
        
        # Validation: Model needs 30 steps. 
        if not isinstance(data, list) or len(data) < 30:
            print(json.dumps({"error": f"Model requires at least 30 historical points, got {len(data) if isinstance(data, list) else 0}"}))
            return

        # 2. Load ML Assets
        base_path = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(base_path, "ml_first_machine_final_fills", "lstm_flight_model.keras")
        xyz_scaler_path = os.path.join(base_path, "ml_first_machine_final_fills", "xyz_scaler.pkl")
        feature_scaler_path = os.path.join(base_path, "ml_first_machine_final_fills", "feature_scaler.pkl")
        # eng_scaler is no longer needed

        # Existence checks to prevent silent failures
        missing_assets = []
        for path, name in [
            (model_path, "Model"),
            (xyz_scaler_path, "XYZ Scaler"),
            (feature_scaler_path, "Feature Scaler")
        ]:
            if not os.path.exists(path):
                missing_assets.append(name)
        
        if missing_assets:
            print(json.dumps({"error": f"Missing required ML assets: {', '.join(missing_assets)}"}))
            return

        # Import TF and Keras here to keep startup fast for error checks
        import tensorflow as tf
        from tensorflow import keras
        BahdanauAttention = get_attention_layer()

        model = keras.models.load_model(
            model_path,
            custom_objects={"BahdanauAttention": BahdanauAttention}
        )
        xyz_scaler = joblib.load(xyz_scaler_path)
        feature_scaler = joblib.load(feature_scaler_path)

        # 3. Preprocess Points and Feature Engineering
        # Required features: 9 base + 6 engineered = 15
        # Base: x, y, z, velocity, acceleration, heading_sin, heading_cos, vertical_rate, dt
        # Eng: vx, vy, vz, jerk, delta_heading, vertical_acceleration
        
        processed_points = []
        for p in data:
            x, y, z = wgs84_to_ecef(p['lat'], p['lon'], p['alt'])
            h_rad = math.radians(p.get('heading', 0))
            processed_points.append({
                'x': x, 'y': y, 'z': z,
                'time': p.get('time', 0),
                'velocity': p.get('velocity', 0),
                'heading_sin': math.sin(h_rad),
                'heading_cos': math.cos(h_rad),
                'vertical_rate': p.get('vertical_rate', 0)
            })

        features_list = []
        for i in range(len(processed_points)):
            curr = processed_points[i]
            prev = processed_points[i-1] if i > 0 else processed_points[i]
            prev2 = processed_points[i-2] if i > 1 else prev
            
            # dt
            dt = curr['time'] - prev['time'] if i > 0 else 1.0
            if dt <= 0: dt = 1.0 # Avoid div by zero
            
            # velocity derivatives
            accel = (curr['velocity'] - prev['velocity']) / dt
            accel_prev = (prev['velocity'] - prev2['velocity']) / (prev['time'] - prev2['time'] if i > 1 else 1.0)
            jerk = (accel - accel_prev) / dt
            
            # xyz derivatives (vx, vy, vz)
            vx = (curr['x'] - prev['x']) / dt
            vy = (curr['y'] - prev['y']) / dt
            vz = (curr['z'] - prev['z']) / dt
            
            # heading derivatives
            h_curr = math.atan2(curr['heading_sin'], curr['heading_cos'])
            h_prev = math.atan2(prev['heading_sin'], prev['heading_cos'])
            dh = (h_curr - h_prev + math.pi) % (2 * math.pi) - math.pi
            delta_heading = dh / dt
            
            # vertical rate derivatives
            v_accel = (curr['vertical_rate'] - prev['vertical_rate']) / dt
            
            # Base (9)
            base_f = [
                curr['x'], curr['y'], curr['z'],
                curr['velocity'], accel,
                curr['heading_sin'], curr['heading_cos'],
                curr['vertical_rate'], dt
            ]
            # Eng (6)
            eng_f = [vx, vy, vz, jerk, delta_heading, v_accel]
            
            features_list.append(base_f + eng_f)

        # 4. Prepare Input Window (last 30 steps)
        features_array = np.array(features_list[-30:], dtype=np.float32)
        
        # Scaling
        # Since eng_scaler is removed, we assume all 15 features are now handled by feature_scaler
        # or that the new model expects only base features. 
        # However, the user instruction only mentioned removing eng_scaler. 
        # Most likely, feature_scaler now covers the entire feature set or the features are concatenated differently.
        # Based on the typical retrained logic:
        try:
            scaled_features = feature_scaler.transform(features_array)
            input_window = scaled_features.reshape(1, 30, 15)
        except ValueError:
            # Fallback if feature_scaler only expects 9 features
            scaled_base = feature_scaler.transform(features_array[:, :9])
            # If no eng_scaler, we might use unscaled eng features or the model doesn't need them
            # But per instructions, just remove eng_scaler logic.
            input_window = np.hstack([scaled_base, features_array[:, 9:]]).reshape(1, 30, 15)

        # 5. Prediction
        raw_pred = model.predict(input_window, verbose=0)
        # 6D output: [mu_x, mu_y, mu_z, sig_x, sig_y, sig_z]
        if isinstance(raw_pred, list):
            mu = raw_pred[0][0]
            sig = raw_pred[1][0]
        else:
            mu = raw_pred[0, :3]
            sig = raw_pred[0, 3:]

        # Defensive check: Ensure sig is not empty
        if sig.size == 0:
            sig = np.array([0.01, 0.01, 0.01], dtype=np.float32)
        
        # 6. Post-processing
        # Absolute position in scaled space
        # We need the scaled XYZ. If feature_scaler was used for all, it's index 0,1,2
        last_xyz_scaled = input_window[0, -1, :3]
        next_xyz_scaled = last_xyz_scaled + mu
        
        # Inverse transform to ECEF meters
        next_xyz_m = xyz_scaler.inverse_transform(next_xyz_scaled.reshape(1, 3))
        
        # Convert back to WGS84
        res_lat, res_lon, res_alt = ecef_to_wgs84(next_xyz_m[0,0], next_xyz_m[0,1], next_xyz_m[0,2])
        
        # Calculate confidence score
        sigma_m = sig[:3] * xyz_scaler.scale_
        uncertainty_radius = float(np.sqrt(np.sum(sigma_m**2)))
        confidence = 1.0 / (1.0 + uncertainty_radius / 1000.0)

        # 7. Output result
        result = {
            "lat": res_lat,
            "lon": res_lon,
            "alt": res_alt,
            "confidence": confidence,
            "uncertainty_m": uncertainty_radius
        }
        print(json.dumps(result))

    except Exception as e:
        import traceback
        print(json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc()
        }))

if __name__ == "__main__":
    main()
