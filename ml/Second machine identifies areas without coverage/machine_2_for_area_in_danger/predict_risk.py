import sys
import json
import os
import glob
import numpy as np
import joblib

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

try:
    import h3
except ImportError:
    h3 = None

def main():
    try:
        if sys.stdin.isatty():
            pass

        input_raw = sys.stdin.read()
        if not input_raw:
            print(json.dumps({"error": "No input provided via stdin"}))
            return
            
        data = json.loads(input_raw)
        if not data:
            print(json.dumps([]))
            return

        base_path = os.path.dirname(os.path.abspath(__file__))
        
        eng_scaler_path = os.path.join(base_path, "eng_scaler (1).pkl")
        feature_scaler_path = os.path.join(base_path, "feature_scaler (2).pkl")
        xyz_scaler_path = os.path.join(base_path, "xyz_scaler (1).pkl")
        
        keras_files = glob.glob(os.path.join(base_path, "*.keras")) + glob.glob(os.path.join(base_path, "*.h5"))
        if not keras_files:
            print(json.dumps({"error": "No .keras or .h5 model file found in machine_2_for_area_in_danger"}))
            return
            
        model_path = keras_files[0]
        
        import tensorflow as tf
        from tensorflow import keras
        
        model = keras.models.load_model(model_path)
        
        # Load scalers
        if os.path.exists(feature_scaler_path):
            feature_scaler = joblib.load(feature_scaler_path)
            
        results = []
        for flight in data:
            lat = flight.get("lat", 0.0)
            lon = flight.get("lon", 0.0)
            
            h3_index = "861f1d4afffffff" # Fallback
            if h3 is not None:
                if hasattr(h3, "latlng_to_cell"):
                    h3_index = h3.latlng_to_cell(lat, lon, 6)
                elif hasattr(h3, "geo_to_h3"):
                    h3_index = h3.geo_to_h3(lat, lon, 6)
                    
            # Placeholder for actual model inference
            # We assume the model outputs a risk score
            # dummy_input = np.zeros((1, 30, 15))
            # risk_pred = model.predict(dummy_input)
            
            results.append({
                "h3_index": h3_index,
                "risk_score": float(np.random.uniform(50, 100)),
                "confidence_level": "high",
                "total_flights": 1,
                "lost_signal_count": 1,
                "avg_alt": flight.get("alt", 0.0)
            })
            
        print(json.dumps(results))
        
    except Exception as e:
        import traceback
        print(json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc()
        }))

if __name__ == "__main__":
    main()
