"""
=======================================================================
  PROBABILISTIC FLIGHT TRAJECTORY PREDICTION  —  RESIDUAL + ATTENTION
  -------------------------------------------------------
  Spatial Prior Model for Search-and-Rescue HDR Integration.
  Outputs a Multivariate Gaussian (diagonal cov) instead of a point.

  Single-file implementation:
    Loading -> Preprocessing -> Model Building -> Training -> Evaluation

  Dataset : perfect_master_dataset.csv (~20 million rows, 11 columns)
  Columns : time, icao24, x, y, z, velocity, acceleration,
            heading_sin, heading_cos, vertical_rate, dt

  KEY CHANGES vs. v2 (point-prediction baseline):
    1. Residual / Delta-Learning — predict (x_t+1 - x_t) offsets.
    2. LSTM → Bi-GRU + Attention hybrid architecture.
    3. Physics-informed features: 3-D velocity, jerk, delta_heading,
       vertical_acceleration.
    4. RobustScaler for engineered features (outlier-resistant).
    5. CosineDecay LR schedule + Gradient Clipping.
    6. Deeper Dense head: 128 → BN → 64 → Dense(6).
    7. ** Probabilistic output: 6D = (μx, μy, μz, σx, σy, σz) **
    8. ** NLL (Negative Log-Likelihood) loss **
    9. ** Calibration diagnostics: 2σ coverage + uncertainty radius **

  Input   : 30 timesteps × 15 features  (look_back=30)
  Output  : 6D — (μx,μy,μz) mean deltas + (σx,σy,σz) uncertainties

  Features (15):
    x, y, z, velocity, acceleration, heading_sin, heading_cos,
    vertical_rate, dt,                           (9 base)
    vx, vy, vz,                                  (3-D velocity)
    jerk,                                        (d(acceleration)/dt)
    delta_heading,                               (angular rate)
    vertical_acceleration,                       (d(vr)/dt)

  Architecture:
    LSTM(256, return_seq)  →  Dropout(0.2)
    Bidirectional GRU(128) →  Dropout(0.2)
    Attention (Bahdanau)   →  context vector
    Dense(128, relu)  →  BatchNorm  →  Dense(64, relu)
    ├── Dense(3, linear)   → μ  (mean deltas)
    └── Dense(3, softplus) → σ  (positive uncertainties)
    Output = concat(μ, σ)  →  6D

  Loss    : Gaussian NLL on *deltas*
  Optim   : Adam + CosineDecay + clipnorm=1.0
  Scaling : RobustScaler (engineered), StandardScaler (base & xyz)
=======================================================================
"""

import os
import sys
import time
import gc
import math
import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import RobustScaler, StandardScaler

# Suppress TensorFlow info / warning noise
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, callbacks

# Allow GPU memory growth (prevents OOM on shared GPUs)
for gpu in tf.config.list_physical_devices("GPU"):
    tf.config.experimental.set_memory_growth(gpu, True)


# =====================================================================
#  CONFIGURATION
# =====================================================================
DATASET_PATH        = "/kaggle/input/datasets/ohadsww/master-final-and-seek-pro/perfect_master_dataset.csv"
LOOK_BACK           = 30          # 30 time-steps of history
MAX_DT_GAP          = 60.0        # discard window if any dt > 60 s
BATCH_SIZE          = 2048
EPOCHS              = 60          # slightly more room since CosineDecay
INITIAL_LR          = 1e-3        # higher start — CosineDecay will anneal
VAL_SPLIT           = 0.2
MODEL_SAVE_PATH     = "flight_residual_model.keras"
XYZ_SCALER_PATH     = "xyz_scaler.pkl"
DELTA_SCALER_PATH   = "delta_scaler.pkl"
FEATURE_SCALER_PATH = "feature_scaler.pkl"
ENG_SCALER_PATH     = "eng_scaler.pkl"       # RobustScaler for engineered

# Original columns from CSV
BASE_FEATURE_COLS = [
    "x", "y", "z",
    "velocity", "acceleration",
    "heading_sin", "heading_cos",
    "vertical_rate", "dt",
]
TARGET_COLS  = ["x", "y", "z"]
NUM_TARGETS  = len(TARGET_COLS)              # 3

# Engineered features added during preprocessing:
#   vx, vy, vz           (3-D velocity)
#   jerk                  (d(acceleration)/dt)
#   delta_heading         (angular rate)
#   vertical_acceleration (d(vertical_rate)/dt)
# Total = 9 base + 6 engineered = 15 feature columns
# The XYZ columns (indices 0-2) are ALSO in the feature vector so the
# generator can compute delta targets from them.
NUM_ENGINEERED = 6
NUM_FEATURES   = len(BASE_FEATURE_COLS) + NUM_ENGINEERED  # 15

# Index of scaled XYZ inside the feature array (always the first 3 cols)
XYZ_IDX = slice(0, 3)


# =====================================================================
#  1.  DATA GENERATOR — Delta (Residual) Targets
# =====================================================================
class FlightSequenceGenerator(keras.utils.Sequence):
    """
    Memory-efficient batch generator.

    * X : (batch, LOOK_BACK, NUM_FEATURES)   30 steps × 15 features
    * Y : (batch, 3)   **delta** target = scaled_xyz[t+1] − scaled_xyz[t]
          i.e. the offset the model must learn, NOT the absolute position.

    The delta is computed in *scaled* space.  At eval time we inverse-
    transform the reconstructed absolute position back to metres.
    """

    def __init__(self, indices, data, batch_size, look_back, shuffle=True):
        self.indices    = indices.copy()
        self.data       = data            # (N_total, NUM_FEATURES) float32
        self.batch_size = batch_size
        self.look_back  = look_back
        self.shuffle    = shuffle
        self.on_epoch_end()

    def __len__(self):
        return int(np.ceil(len(self.indices) / self.batch_size))

    def __getitem__(self, idx):
        start = idx * self.batch_size
        end   = min(start + self.batch_size, len(self.indices))
        batch_idx = self.indices[start:end]
        bs = len(batch_idx)

        X = np.empty((bs, self.look_back, self.data.shape[1]),
                     dtype=np.float32)
        Y = np.empty((bs, NUM_TARGETS), dtype=np.float32)

        for j, i in enumerate(batch_idx):
            X[j] = self.data[i : i + self.look_back]
            # Delta target: next_xyz − last_xyz  (in scaled space)
            last_xyz = self.data[i + self.look_back - 1, XYZ_IDX]
            next_xyz = self.data[i + self.look_back,     XYZ_IDX]
            Y[j] = next_xyz - last_xyz

        return X, Y

    def on_epoch_end(self):
        if self.shuffle:
            np.random.shuffle(self.indices)


# =====================================================================
#  2.  ATTENTION LAYER  (Bahdanau-style, learnable)
# =====================================================================
class BahdanauAttention(layers.Layer):
    """
    Learns which of the LOOK_BACK time-steps matter most.

    Input  : (batch, timesteps, features)
    Output : (batch, features)  — weighted context vector
    """

    def __init__(self, units=128, **kwargs):
        super().__init__(**kwargs)
        self.W = layers.Dense(units, use_bias=True)
        self.V = layers.Dense(1, use_bias=False)

    def call(self, values):
        # values: (batch, T, D)
        score = self.V(tf.nn.tanh(self.W(values)))   # (batch, T, 1)
        weights = tf.nn.softmax(score, axis=1)        # (batch, T, 1)
        context = tf.reduce_sum(weights * values, axis=1)  # (batch, D)
        return context

    def get_config(self):
        cfg = super().get_config()
        return cfg


# =====================================================================
#  3.  GAUSSIAN NLL LOSS  (Diagonal Covariance)
# =====================================================================
def gaussian_nll_loss(y_true, y_pred):
    """
    Negative Log-Likelihood for a diagonal multivariate Gaussian.

    y_true : (batch, 3)   — ground-truth delta (dx, dy, dz)
    y_pred : (batch, 6)   — predicted (μx, μy, μz, σx, σy, σz)

    NLL = 0.5 * Σ_i [ log(σ_i²) + (y_i - μ_i)² / σ_i² ] + const
    """
    EPS   = 1e-6                            # numerical stability
    mu    = y_pred[:, :NUM_TARGETS]          # (batch, 3)
    sigma = y_pred[:, NUM_TARGETS:] + EPS    # (batch, 3), already softplus'd

    var   = tf.square(sigma)                 # σ²
    diff  = y_true - mu

    # NLL per sample per dim: 0.5 * [log(var) + diff² / var]
    nll = 0.5 * (tf.math.log(var) + tf.square(diff) / var)
    return tf.reduce_mean(nll)               # scalar


def mu_mae(y_true, y_pred):
    """
    MAE computed only on the μ (mean) portion of the 6D output.
    y_true : (batch, 3)
    y_pred : (batch, 6)  — first 3 are μ, last 3 are σ
    """
    mu = y_pred[:, :NUM_TARGETS]
    return tf.reduce_mean(tf.abs(y_true - mu))


# =====================================================================
#  4.  CUSTOM CALLBACK — probabilistic diagnostics
# =====================================================================
class ProbabilisticMetersCallback(callbacks.Callback):
    """
    Reports:
      • Mean / Median L2 error (metres)
      • Average uncertainty radius (mean σ in metres)
      • 2σ calibration: % of true points within predicted 2σ per axis
        (theoretical ideal ≈ 95.4 %)
    """

    def __init__(self, val_gen, xyz_scaler, max_eval_batches=50):
        super().__init__()
        self.val_gen          = val_gen
        self.xyz_scaler       = xyz_scaler
        self.max_eval_batches = min(max_eval_batches, len(val_gen))

    def on_epoch_end(self, epoch, logs=None):
        all_l2      = []
        all_sigma_m  = []
        within_2sig  = 0
        total_pts    = 0
        gen          = self.val_gen

        for i in range(self.max_eval_batches):
            X_batch, Y_delta_true = gen[i]
            raw_pred = self.model.predict(X_batch, verbose=0)

            mu_pred    = raw_pred[:, :NUM_TARGETS]       # (batch, 3)
            sigma_pred = raw_pred[:, NUM_TARGETS:]       # (batch, 3)

            # --- L2 in metres ---
            last_xyz_scaled = X_batch[:, -1, :NUM_TARGETS]

            abs_true_scaled = last_xyz_scaled + Y_delta_true
            abs_pred_scaled = last_xyz_scaled + mu_pred

            abs_true_m = self.xyz_scaler.inverse_transform(abs_true_scaled)
            abs_pred_m = self.xyz_scaler.inverse_transform(abs_pred_scaled)

            diff = abs_pred_m - abs_true_m
            l2   = np.sqrt(np.sum(diff ** 2, axis=1))
            all_l2.extend(l2)

            # --- σ in metres (scale back using xyz_scaler.scale_) ---
            sigma_m = sigma_pred * self.xyz_scaler.scale_  # broadcast (3,)
            all_sigma_m.append(sigma_m)

            # --- 2σ calibration (per-axis, in scaled space) ---
            residual_scaled = Y_delta_true - mu_pred     # (batch, 3)
            within = np.all(
                np.abs(residual_scaled) <= 2.0 * sigma_pred, axis=1
            )
            within_2sig += np.sum(within)
            total_pts   += len(within)

        mean_l2  = np.mean(all_l2)
        med_l2   = np.median(all_l2)
        sigma_m  = np.concatenate(all_sigma_m, axis=0)
        avg_unc  = np.mean(np.sqrt(np.sum(sigma_m ** 2, axis=1)))
        calib    = 100.0 * within_2sig / max(total_pts, 1)

        print(
            f"  >> Metres | Mean L2={mean_l2:,.1f} m  "
            f"Med={med_l2:,.1f} m  "
            f"Unc={avg_unc:,.1f} m  "
            f"2σ-cov={calib:.1f}%"
        )


# =====================================================================
#  5.  MODEL ARCHITECTURE — Probabilistic LSTM + Bi-GRU + Attention
# =====================================================================
NUM_OUTPUTS = NUM_TARGETS * 2  # 6: (μx,μy,μz, σx,σy,σz)


def build_model(total_steps: int):
    """
    Probabilistic model with dual-head output (μ + σ).

    Layer stack:
      Input(30, 15)
      LSTM(256, return_seq) → Dropout(0.2)
      Bidirectional GRU(128, return_seq) → Dropout(0.2)
      BahdanauAttention(128)             ← learns timestep importance
      Dense(128, relu) → BatchNorm → Dense(64, relu)
      ├── Dense(3, linear)   → μ   (mean deltas)
      └── Dense(3, softplus) → σ   (positive uncertainties)
      Output = concat(μ, σ) → 6D

    Optimizer : Adam + CosineDecay + clipnorm=1.0
    Loss      : Gaussian NLL
    """
    inp = layers.Input(shape=(LOOK_BACK, NUM_FEATURES), name="input")

    # --- Recurrent backbone ---
    x = layers.LSTM(256, return_sequences=True, name="lstm_256")(inp)
    x = layers.Dropout(0.2, name="drop_1")(x)

    x = layers.Bidirectional(
        layers.GRU(128, return_sequences=True, name="gru_128"),
        name="bigru_128",
    )(x)
    x = layers.Dropout(0.2, name="drop_2")(x)

    # --- Attention ---
    x = BahdanauAttention(units=128, name="attention")(x)  # (batch, 256)

    # --- Shared Dense trunk ---
    x = layers.Dense(128, activation="relu", name="dense_128")(x)
    x = layers.BatchNormalization(name="bn_128")(x)
    x = layers.Dense(64, activation="relu", name="dense_64")(x)

    # --- Dual heads ---
    mu    = layers.Dense(NUM_TARGETS, activation="linear", name="mu")(x)
    sigma = layers.Dense(NUM_TARGETS, activation="softplus", name="sigma")(x)

    out = layers.Concatenate(name="output")([mu, sigma])  # (batch, 6)

    model = keras.Model(
        inputs=inp, outputs=out, name="FlightProbabilisticNet"
    )

    # --- CosineDecay schedule ---
    lr_schedule = keras.optimizers.schedules.CosineDecay(
        initial_learning_rate=INITIAL_LR,
        decay_steps=total_steps,
        alpha=1e-6,                       # minimum LR at end of training
    )

    # --- Gradient clipping for NLL stability ---
    optimizer = keras.optimizers.Adam(
        learning_rate=lr_schedule,
        clipnorm=1.0,
    )

    model.compile(
        optimizer=optimizer,
        loss=gaussian_nll_loss,
        metrics=[mu_mae],
    )
    return model


# =====================================================================
#  6.  MAIN  — Loading → Preprocessing → Training → Evaluation
# =====================================================================
def main():
    wall_start = time.time()

    print("=" * 70)
    print("  PROBABILISTIC FLIGHT TRAJECTORY PREDICTION (NLL)")
    print("  Spatial Prior for Search-and-Rescue HDR Integration")
    print("=" * 70)
    print(f"  look_back      = {LOOK_BACK} steps")
    print(f"  max_dt_gap     = {MAX_DT_GAP} s")
    print(f"  batch_size     = {BATCH_SIZE}")
    print(f"  epochs         = {EPOCHS}")
    print(f"  initial_lr     = {INITIAL_LR}")
    gpus = tf.config.list_physical_devices("GPU")
    print(f"  device         = {'GPU (' + gpus[0].name + ')' if gpus else 'CPU'}")
    print("=" * 70)

    # -----------------------------------------------------------------
    #  STEP 1 — Load dataset (chunked for 20 M+ rows)
    # -----------------------------------------------------------------
    print(f"\n{'---'*23}")
    print("  [1/6]  Loading dataset ...")
    print(f"{'---'*23}")

    if not os.path.isfile(DATASET_PATH):
        print(f"  ERROR: file not found -> {DATASET_PATH}")
        sys.exit(1)

    t0     = time.time()
    chunks = []
    total  = 0

    for i, chunk in enumerate(pd.read_csv(DATASET_PATH, chunksize=500_000)):
        chunks.append(chunk)
        total += len(chunk)
        if (i + 1) % 10 == 0:
            print(f"    {total:>14,} rows ...", flush=True)

    df = pd.concat(chunks, ignore_index=True)
    del chunks
    gc.collect()

    print(f"  Total rows loaded : {len(df):,}")
    print(f"  Columns           : {list(df.columns)}")
    mem_gb = df.memory_usage(deep=True).sum() / 1e9
    print(f"  Memory            : {mem_gb:.2f} GB")
    print(f"  Time              : {time.time() - t0:.1f} s")

    # Quick sanity check on expected columns
    missing = [c for c in BASE_FEATURE_COLS + ["time", "icao24"]
               if c not in df.columns]
    if missing:
        print(f"  ERROR: missing columns -> {missing}")
        sys.exit(1)

    # -----------------------------------------------------------------
    #  STEP 2 — Sort & extract metadata
    # -----------------------------------------------------------------
    print(f"\n{'---'*23}")
    print("  [2/6]  Sorting & extracting metadata ...")
    print(f"{'---'*23}")

    df.sort_values(["icao24", "time"], inplace=True)
    df.reset_index(drop=True, inplace=True)

    # Save original dt for the > 60 s validation (before scaling)
    original_dt = df["dt"].values.astype(np.float64)

    # Identify group (icao24) boundaries via vectorised comparison
    icao_vals    = df["icao24"].values
    transitions  = np.where(icao_vals[:-1] != icao_vals[1:])[0] + 1
    group_bounds = np.concatenate([[0], transitions, [len(df)]])
    num_groups   = len(group_bounds) - 1

    print(f"  Unique aircraft (icao24 groups) : {num_groups:,}")
    del icao_vals
    gc.collect()

    # -----------------------------------------------------------------
    #  STEP 3 — Fit scalers  (StandardScaler for base, RobustScaler
    #                          for engineered features)
    # -----------------------------------------------------------------
    print(f"\n{'---'*23}")
    print("  [3/6]  Fitting scalers ...")
    print(f"{'---'*23}")

    n_rows = len(df)

    # --- XYZ scaler (StandardScaler — saved for inverse transform) ---
    xyz_scaler = StandardScaler()
    xyz_scaler.fit(df[TARGET_COLS].values)
    joblib.dump(xyz_scaler, XYZ_SCALER_PATH)
    print(f"  XYZ StandardScaler saved -> {XYZ_SCALER_PATH}")
    for i, col in enumerate(TARGET_COLS):
        mu, sd = xyz_scaler.mean_[i], xyz_scaler.scale_[i]
        print(f"    {col} : mean={mu:+.2f}  std={sd:,.0f}")

    # --- Base 9-feature scaler (StandardScaler) ---
    feature_scaler = StandardScaler()
    scaled_base = feature_scaler.fit_transform(
        df[BASE_FEATURE_COLS].values
    ).astype(np.float32)
    joblib.dump(feature_scaler, FEATURE_SCALER_PATH)
    print(f"  Feature StandardScaler saved -> {FEATURE_SCALER_PATH}")
    print(f"  Scaled base shape            : {scaled_base.shape}")

    # -----------------------------------------------------------------
    #  PHYSICS-INFORMED FEATURE ENGINEERING
    #    vx, vy, vz  — 3-D velocity (dx/dt, dy/dt, dz/dt)
    #    jerk         — d(acceleration) / dt
    #    delta_heading             — angular change
    #    vertical_acceleration     — d(vertical_rate) / dt
    # -----------------------------------------------------------------
    print(f"\n  Engineering physics features ...")

    dt_vals = df["dt"].values.astype(np.float64)
    dt_safe = np.where(dt_vals > 0, dt_vals, 1.0)  # avoid div-by-zero

    # --- 3-D Velocity: dx/dt, dy/dt, dz/dt ---
    xyz_raw = df[["x", "y", "z"]].values.astype(np.float64)
    vx = np.zeros(n_rows, dtype=np.float64)
    vy = np.zeros(n_rows, dtype=np.float64)
    vz = np.zeros(n_rows, dtype=np.float64)
    vx[1:] = np.diff(xyz_raw[:, 0]) / dt_safe[1:]
    vy[1:] = np.diff(xyz_raw[:, 1]) / dt_safe[1:]
    vz[1:] = np.diff(xyz_raw[:, 2]) / dt_safe[1:]

    # --- Jerk: d(acceleration) / dt ---
    accel = df["acceleration"].values.astype(np.float64)
    jerk = np.zeros(n_rows, dtype=np.float64)
    jerk[1:] = np.diff(accel) / dt_safe[1:]

    # --- Delta heading (wrap-safe angular diff) ---
    heading_sin = df["heading_sin"].values.astype(np.float64)
    heading_cos = df["heading_cos"].values.astype(np.float64)
    heading_rad = np.arctan2(heading_sin, heading_cos)
    delta_heading = np.zeros(n_rows, dtype=np.float64)
    dh = np.diff(heading_rad)
    dh = (dh + np.pi) % (2 * np.pi) - np.pi
    delta_heading[1:] = dh

    # --- Vertical acceleration: d(vertical_rate) / dt ---
    vr = df["vertical_rate"].values.astype(np.float64)
    vertical_accel = np.zeros(n_rows, dtype=np.float64)
    vertical_accel[1:] = np.diff(vr) / dt_safe[1:]

    # Zero-out cross-group first rows (avoid leaking data between flights)
    first_in_group = np.concatenate([[0], transitions])
    for arr in [vx, vy, vz, jerk, delta_heading, vertical_accel]:
        arr[first_in_group] = 0.0

    # Stack engineered features (n_rows, 6)
    eng_raw = np.column_stack([
        vx, vy, vz, jerk, delta_heading, vertical_accel,
    ]).astype(np.float64)

    print(f"    vx  range : [{vx.min():+.1f} .. {vx.max():+.1f}] m/s")
    print(f"    vy  range : [{vy.min():+.1f} .. {vy.max():+.1f}] m/s")
    print(f"    vz  range : [{vz.min():+.1f} .. {vz.max():+.1f}] m/s")
    print(f"    jerk range: [{jerk.min():+.1f} .. {jerk.max():+.1f}] m/s³")

    # --- RobustScaler for engineered features (outlier-resistant) ---
    eng_scaler = RobustScaler()
    scaled_eng = eng_scaler.fit_transform(eng_raw).astype(np.float32)
    joblib.dump(eng_scaler, ENG_SCALER_PATH)
    print(f"  Engineered RobustScaler saved -> {ENG_SCALER_PATH}")

    # Concatenate: 9 base (StandardScaled) + 6 engineered (RobustScaled) = 15
    scaled_data = np.hstack([scaled_base, scaled_eng])
    print(f"  Final scaled shape : {scaled_data.shape}  ({NUM_FEATURES} features)")

    assert scaled_data.shape[1] == NUM_FEATURES, (
        f"Feature count mismatch: got {scaled_data.shape[1]}, "
        f"expected {NUM_FEATURES}"
    )

    # Clean up large intermediates
    del scaled_base, scaled_eng, eng_raw
    del vx, vy, vz, jerk, delta_heading, vertical_accel
    del heading_sin, heading_cos, heading_rad, vr, dt_vals, accel, xyz_raw
    del df
    gc.collect()

    # -----------------------------------------------------------------
    #  STEP 4 — Generate valid sequence indices  (strict dt check)
    # -----------------------------------------------------------------
    print(f"\n{'---'*23}")
    print("  [4/6]  Generating valid sequences  (strict dt <= 60 s) ...")
    print(f"{'---'*23}")
    t0 = time.time()

    WINDOW_SIZE     = LOOK_BACK + 1          # 31 contiguous rows per sample
    valid_parts     = []
    total_possible  = 0
    total_discarded = 0
    conv_kernel     = np.ones(WINDOW_SIZE, dtype=np.float64)

    for g in range(num_groups):
        g_start = int(group_bounds[g])
        g_end   = int(group_bounds[g + 1])
        g_len   = g_end - g_start

        if g_len < WINDOW_SIZE:
            continue

        num_win = g_len - WINDOW_SIZE + 1
        total_possible += num_win

        group_dt = original_dt[g_start:g_end]
        invalid  = np.isnan(group_dt) | (group_dt > MAX_DT_GAP)

        invalid_count = np.convolve(
            invalid.astype(np.float64), conv_kernel, mode="valid"
        )

        ok_local  = np.where(invalid_count == 0.0)[0]
        ok_global = ok_local + g_start

        total_discarded += num_win - len(ok_local)
        valid_parts.append(ok_global)

        if (g + 1) % 50_000 == 0:
            cum_valid = sum(len(v) for v in valid_parts)
            print(
                f"    {g + 1:>8,} / {num_groups:,} groups  |  "
                f"valid so far: {cum_valid:,}",
                flush=True,
            )

    valid_indices = np.concatenate(valid_parts).astype(np.int64)
    del original_dt, valid_parts
    gc.collect()

    print(f"  Total possible sequences    : {total_possible:,}")
    print(f"  Discarded (dt>{MAX_DT_GAP}s / NaN) : {total_discarded:,}")
    print(f"  >>> Valid sequences          : {len(valid_indices):,} <<<")
    print(f"  Time                         : {time.time() - t0:.1f} s")

    if len(valid_indices) == 0:
        print("\n  ERROR: zero valid sequences.  Check the dataset.\n")
        sys.exit(1)

    # -----------------------------------------------------------------
    #  Train / Validation split
    # -----------------------------------------------------------------
    rng = np.random.RandomState(42)
    rng.shuffle(valid_indices)

    split_idx = int(len(valid_indices) * (1.0 - VAL_SPLIT))
    train_idx = valid_indices[:split_idx]
    val_idx   = valid_indices[split_idx:]

    print(f"\n  Train sequences : {len(train_idx):,}")
    print(f"  Val   sequences : {len(val_idx):,}")

    train_gen = FlightSequenceGenerator(
        train_idx, scaled_data, BATCH_SIZE, LOOK_BACK, shuffle=True,
    )
    val_gen = FlightSequenceGenerator(
        val_idx, scaled_data, BATCH_SIZE, LOOK_BACK, shuffle=False,
    )

    print(f"  Train batches/epoch : {len(train_gen):,}")
    print(f"  Val   batches/epoch : {len(val_gen):,}")

    # -----------------------------------------------------------------
    #  STEP 5 — Build & train model
    # -----------------------------------------------------------------
    print(f"\n{'---'*23}")
    print("  [5/6]  Building Probabilistic Residual + Attention model ...")
    print(f"{'---'*23}")

    total_train_steps = len(train_gen) * EPOCHS
    model = build_model(total_steps=total_train_steps)
    model.summary()

    cb_list = [
        # Early stopping — restore best weights automatically
        callbacks.EarlyStopping(
            monitor="val_loss",
            patience=10,
            restore_best_weights=True,
            verbose=1,
        ),
        # Save best model on disk
        callbacks.ModelCheckpoint(
            MODEL_SAVE_PATH,
            monitor="val_loss",
            save_best_only=True,
            verbose=1,
        ),
        # Probabilistic diagnostics: L2, uncertainty, calibration
        ProbabilisticMetersCallback(
            val_gen, xyz_scaler, max_eval_batches=50
        ),
    ]

    print(f"\n{'---'*23}")
    print("  [6/6]  Training ...")
    print(f"{'---'*23}\n")

    history = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=EPOCHS,
        callbacks=cb_list,
        verbose=1,
    )

    # -----------------------------------------------------------------
    #  FINAL EVALUATION  (full validation set, in metres)
    # -----------------------------------------------------------------
    print(f"\n{'='*70}")
    print("  FINAL EVALUATION  (best checkpoint, full validation set)")
    print(f"{'='*70}")

    best_model = keras.models.load_model(
        MODEL_SAVE_PATH,
        custom_objects={
            "BahdanauAttention": BahdanauAttention,
            "gaussian_nll_loss": gaussian_nll_loss,
            "mu_mae": mu_mae,
        },
    )

    all_l2       = []
    all_diff     = []
    all_sigma_m  = []
    within_2sig  = 0
    total_pts    = 0

    eval_gen = FlightSequenceGenerator(
        val_idx, scaled_data, BATCH_SIZE, LOOK_BACK, shuffle=False,
    )

    print(f"  Evaluating {len(eval_gen)} batches ...")
    for i in range(len(eval_gen)):
        X_b, Y_delta_true = eval_gen[i]
        raw_pred = best_model.predict(X_b, verbose=0)

        mu_pred    = raw_pred[:, :NUM_TARGETS]       # (batch, 3)
        sigma_pred = raw_pred[:, NUM_TARGETS:]       # (batch, 3)

        # Reconstruct absolute positions from mean deltas
        last_xyz_scaled = X_b[:, -1, :NUM_TARGETS]
        abs_true_scaled = last_xyz_scaled + Y_delta_true
        abs_pred_scaled = last_xyz_scaled + mu_pred

        # Inverse-transform to ECEF metres
        abs_true_m = xyz_scaler.inverse_transform(abs_true_scaled)
        abs_pred_m = xyz_scaler.inverse_transform(abs_pred_scaled)

        diff = abs_pred_m - abs_true_m
        l2   = np.sqrt(np.sum(diff ** 2, axis=1))

        all_l2.extend(l2)
        all_diff.append(diff)

        # --- σ in metres ---
        sigma_m = sigma_pred * xyz_scaler.scale_
        all_sigma_m.append(sigma_m)

        # --- 2σ calibration ---
        residual_scaled = Y_delta_true - mu_pred
        within = np.all(
            np.abs(residual_scaled) <= 2.0 * sigma_pred, axis=1
        )
        within_2sig += int(np.sum(within))
        total_pts   += len(within)

        if (i + 1) % 100 == 0:
            print(f"    batch {i + 1}/{len(eval_gen)} ...", flush=True)

    all_l2      = np.array(all_l2)
    all_diff    = np.concatenate(all_diff, axis=0)
    all_sigma_m = np.concatenate(all_sigma_m, axis=0)

    mean_l2   = np.mean(all_l2)
    median_l2 = np.median(all_l2)
    p90_l2    = np.percentile(all_l2, 90)
    p95_l2    = np.percentile(all_l2, 95)

    mae_x = np.mean(np.abs(all_diff[:, 0]))
    mae_y = np.mean(np.abs(all_diff[:, 1]))
    mae_z = np.mean(np.abs(all_diff[:, 2]))

    # Uncertainty metrics
    avg_unc_radius = np.mean(np.sqrt(np.sum(all_sigma_m ** 2, axis=1)))
    avg_sigma_x    = np.mean(all_sigma_m[:, 0])
    avg_sigma_y    = np.mean(all_sigma_m[:, 1])
    avg_sigma_z    = np.mean(all_sigma_m[:, 2])
    calib_2sig     = 100.0 * within_2sig / max(total_pts, 1)

    print(f"\n  {'Metric':<38s}  {'Value':>12s}")
    print(f"  {'_' * 53}")
    print(f"  {'Mean Euclidean error (L2)':<38s}  {mean_l2:>10,.2f} m")
    print(f"  {'Median Euclidean error':<38s}  {median_l2:>10,.2f} m")
    print(f"  {'P90 Euclidean error':<38s}  {p90_l2:>10,.2f} m")
    print(f"  {'P95 Euclidean error':<38s}  {p95_l2:>10,.2f} m")
    print(f"  {'_' * 53}")
    print(f"  {'MAE  X-axis':<38s}  {mae_x:>10,.2f} m")
    print(f"  {'MAE  Y-axis':<38s}  {mae_y:>10,.2f} m")
    print(f"  {'MAE  Z-axis':<38s}  {mae_z:>10,.2f} m")
    print(f"  {'_' * 53}")
    print(f"  {'Avg Uncertainty Radius (3D σ)':<38s}  {avg_unc_radius:>10,.2f} m")
    print(f"  {'Avg σ_x':<38s}  {avg_sigma_x:>10,.2f} m")
    print(f"  {'Avg σ_y':<38s}  {avg_sigma_y:>10,.2f} m")
    print(f"  {'Avg σ_z':<38s}  {avg_sigma_z:>10,.2f} m")
    print(f"  {'_' * 53}")
    print(f"  {'2σ Calibration (ideal ≈ 95.4%)':<38s}  {calib_2sig:>9.1f} %")
    print(f"  {'_' * 53}")

    # -----------------------------------------------------------------
    #  Summary
    # -----------------------------------------------------------------
    elapsed = time.time() - wall_start
    hours   = int(elapsed // 3600)
    mins    = int((elapsed % 3600) // 60)
    secs    = int(elapsed % 60)

    print(f"\n{'='*70}")
    print(f"  DONE")
    print(f"{'='*70}")
    print(f"  Valid sequences generated : {len(valid_indices):,}")
    print(f"  Final accuracy (L2 mean)  : {mean_l2:,.2f} metres")
    print(f"  Total wall time           : {hours}h {mins}m {secs}s")
    print(f"  Model saved               : {MODEL_SAVE_PATH}")
    print(f"  XYZ scaler                : {XYZ_SCALER_PATH}")
    print(f"  Feature scaler            : {FEATURE_SCALER_PATH}")
    print(f"  Eng scaler (Robust)       : {ENG_SCALER_PATH}")
    print(f"{'='*70}\n")


# =====================================================================
if __name__ == "__main__":
    main()
