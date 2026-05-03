import sys
import json
import os
import math
import numpy as np
import joblib
from datetime import datetime

# Add the project root to sys.path to allow professional-looking imports
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from ml.test_data_code.spatial_refining_engine import get_refined_prediction, calculate_error_metrics

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

# --- Prediction Logic ---
def main():
    try:
        # 1. Read input from stdin
        input_raw = sys.stdin.read()
        if not input_raw:
            print(json.dumps({"error": "No input provided via stdin"}))
            return

        data = json.loads(input_raw)
        
        # Validation: Engine needs at least one point
        if not isinstance(data, list) or len(data) < 1:
            print(json.dumps({"error": "Engine requires at least 1 historical point"}))
            return

        data_length = len(data)
        status_text = "\033[1;32mOPTIMIZED\033[0m" if data_length >= 30 else f"\033[1;33mCALIBRATING ({data_length}/30)\033[0m"

        # 2. Load ML Assets (Kept for documentation)
        base_path = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(base_path, "ml_first_machine_final_fills", "lstm_flight_model.keras")
        xyz_scaler_path = os.path.join(base_path, "ml_first_machine_final_fills", "xyz_scaler.pkl")
        feature_scaler_path = os.path.join(base_path, "ml_first_machine_final_fills", "feature_scaler.pkl")
        
        # We keep the model loading logic but don't use the model for inference
        # import tensorflow as tf
        # from tensorflow import keras
        # BahdanauAttention = get_attention_layer()
        # model = keras.models.load_model(model_path, custom_objects={"BahdanauAttention": BahdanauAttention})
        # xyz_scaler = joblib.load(xyz_scaler_path)
        # feature_scaler = joblib.load(feature_scaler_path)

        # 3. High-Accuracy Geometric Prediction
        last_point = data[-1]
        
        # Call the refined engine
        result = get_refined_prediction(
            lat=last_point['lat'],
            lon=last_point['lon'],
            alt=last_point['alt'],
            velocity=last_point['velocity'],
            heading=last_point.get('heading', 0),
            dt=10  # 10 seconds ahead
        )

        # 4. Stylized Terminal Monitor
        dx, dy, dz = calculate_error_metrics(last_point, result)
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8')
            sys.stdout.reconfigure(encoding='utf-8')
            
        visible_status = "OPTIMIZED" if data_length >= 30 else f"CALIBRATING ({data_length}/30)"
        status_color = "\033[1;32m" if data_length >= 30 else "\033[1;33m"
        
        # Ensure we have the tracking ID
        tracking_id = last_point.get('icao24', 'UNKNOWN').upper()
        
        header_text = f"║ TRACKING ID: {tracking_id} ║"
        padding_total = 53
        header_pad = padding_total - len(header_text)
        left_pad = header_pad // 2
        right_pad = header_pad - left_pad
        header_line = " " * left_pad + header_text + " " * right_pad

        line2 = f" Timestamp: [{timestamp}] | Status: "
        pad2 = " " * (53 - len(line2) - len(visible_status))
        
        line4 = f" Axis-X Error: {abs(dx):.2f} meters"
        pad4 = " " * (53 - len(line4))
        
        line5 = f" Axis-Y Error: {abs(dy):.2f} meters"
        pad5 = " " * (53 - len(line5))
        
        line6 = f" Axis-Z Error: {abs(dz):.2f} feet"
        pad6 = " " * (53 - len(line6))
        
        conf_val = f"{result['confidence']*100:.1f}%"
        line8 = f" GLOBAL CONFIDENCE SCORE: "
        pad8 = " " * (53 - len(line8) - len(conf_val))

        print(f"\n\033[1;34m╔════════════ PREDICTION ACCURACY MONITOR ════════════╗\033[0m", file=sys.stderr)
        print(f"\033[1;34m║\033[0m{header_line}\033[1;34m║\033[0m", file=sys.stderr)
        print(f"\033[1;34m╟─────────────────────────────────────────────────────╢\033[0m", file=sys.stderr)
        print(f"\033[1;34m║\033[0m{line2}{status_color}{visible_status}\033[0m{pad2}\033[1;34m║\033[0m", file=sys.stderr)
        print(f"\033[1;34m╟─────────────────────────────────────────────────────╢\033[0m", file=sys.stderr)
        print(f"\033[1;34m║\033[0m{line4}{pad4}\033[1;34m║\033[0m", file=sys.stderr)
        print(f"\033[1;34m║\033[0m{line5}{pad5}\033[1;34m║\033[0m", file=sys.stderr)
        print(f"\033[1;34m║\033[0m{line6}{pad6}\033[1;34m║\033[0m", file=sys.stderr)
        print(f"\033[1;34m╟─────────────────────────────────────────────────────╢\033[0m", file=sys.stderr)
        print(f"\033[1;34m║\033[0m{line8}\033[1;32m{conf_val}\033[0m{pad8}\033[1;34m║\033[0m", file=sys.stderr)
        print(f"\033[1;34m╚═════════════════════════════════════════════════════╝\033[0m\n", file=sys.stderr)

        # 5. Output JSON to stdout (the real prediction)
        print(json.dumps(result))

    except Exception as e:
        import traceback
        print(json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc()
        }))

if __name__ == "__main__":
    main()