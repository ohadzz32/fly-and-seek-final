import numpy as np
import joblib
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

# --- חלק א': הגדרת שכבת ה-Attention (חובה כדי לטעון את המודל) ---
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
        return super().get_config()

# --- חלק ב': טעינת הנכסים (Assets) ---
print("🔄 Loading model and scalers...")

# טעינת המודל עם האובייקט המותאם אישית
model = keras.models.load_model(
    "flight_residual_model.keras",
    custom_objects={"BahdanauAttention": BahdanauAttention}
)

# טעינת הסקיילרים
xyz_scaler = joblib.load("xyz_scaler.pkl")
feature_scaler = joblib.load("feature_scaler.pkl")
eng_scaler = joblib.load("eng_scaler.pkl")

print("✅ Success! Everything is loaded.")

# --- חלק ג': בדיקת הרצה מהירה ---
# המודל מצפה ל-30 צעדי זמן עם 15 מאפיינים
dummy_data = np.random.rand(1, 30, 15).astype(np.float32)
prediction = model.predict(dummy_data, verbose=0)

print(f"🎯 Test Prediction (Delta): {prediction}")