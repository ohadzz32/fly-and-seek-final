"""
=======================================================================
  STABLE FLIGHT TRAJECTORY PREDICTOR  —  GRU + Local Tangent Plane
  -----------------------------------------------------------------
  Goal   : Predict the next 60 s (1 minute) from 30 s of history
  Target : ~3 km stable error  (P90 ≈ Mean  →  low variance)
  Arch   : 3-layer GRU  →  Linear output head (predicts X/Y/Z metres)
  Loss   : SmoothL1 (Huber) — outlier-robust
  Sched  : OneCycleLR — smooth, single-cycle convergence
  Eval   : Haversine @ 60 s  (mean / median / P90)
  Data   : 1 Hz resampled  →  Local Tangent Plane projection (metres)
=======================================================================
"""

import os, math, json, warnings
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from dataclasses import dataclass
from typing import List, Tuple, Dict
from tqdm import tqdm

warnings.filterwarnings("ignore")


# =====================================================================
#  1. CONFIGURATION
# =====================================================================
@dataclass
class Config:
    # — paths —
    input_csv  : str = "/kaggle/input/final-dataset-with-the-fillmaster/master_training_dataset.csv"
    work_dir   : str = "/kaggle/working/"
    model_file : str = "best_gru_model.pt"

    # — sequence —
    input_window : int = 30       # 30 seconds of history
    pred_horizon : int = 60       # predict next 60 seconds

    # — data —
    max_flights    : int = 12_000
    min_flight_len : int = 120    # need at least input+pred = 90, pad a bit
    window_step    : int = 15     # sliding-window stride  →  many samples
    train_split    : float = 0.9

    # — features —
    # Per timestep: x_m, y_m, z_m, vx, vy, vz, speed,
    #               sin_hdg, cos_hdg, d_speed, d_sin_hdg, d_cos_hdg  = 12
    num_input_features  : int = 12
    num_output_features : int = 3   # x_m, y_m, z_m  (metres)

    # — GRU architecture —
    hidden_size : int = 256
    num_layers  : int = 3
    dropout     : float = 0.2

    # — training —
    batch_size   : int = 256
    lr           : float = 1e-3
    weight_decay : float = 1e-4
    epochs       : int = 60
    patience     : int = 12
    grad_clip    : float = 1.0

    # — augmentation —
    noise_std : float = 0.5   # metres-scale noise on LTP inputs

    # — device —
    device : str = ""

    def __post_init__(self):
        if not self.device:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model_path = os.path.join(self.work_dir, self.model_file)
        os.makedirs(self.work_dir, exist_ok=True)


# =====================================================================
#  2. LOCAL TANGENT PLANE  (LTP)  — lat/lon/alt → metres
# =====================================================================

def latlon_to_metres(lat: np.ndarray, lon: np.ndarray, alt: np.ndarray,
                     ref_lat: float, ref_lon: float, ref_alt: float
                     ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Convert WGS-84 coordinates to a local tangent plane centred on
    (ref_lat, ref_lon, ref_alt).  Returns (x_east, y_north, z_up) in metres.
    """
    R = 6_371_000.0
    rlat = np.radians(ref_lat)
    x = R * np.radians(lon - ref_lon) * np.cos(rlat)   # east
    y = R * np.radians(lat - ref_lat)                   # north
    z = alt - ref_alt                                    # up
    return x.astype(np.float32), y.astype(np.float32), z.astype(np.float32)


def metres_to_latlon(x: np.ndarray, y: np.ndarray, z: np.ndarray,
                     ref_lat: float, ref_lon: float, ref_alt: float
                     ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Inverse of latlon_to_metres."""
    R = 6_371_000.0
    rlat = np.radians(ref_lat)
    lat = ref_lat + np.degrees(y / R)
    lon = ref_lon + np.degrees(x / (R * np.cos(rlat)))
    alt = z + ref_alt
    return lat, lon, alt


# =====================================================================
#  3. DATA LOADING & PROCESSING
# =====================================================================

class FlightDataProcessor:
    """Load CSV → segment flights → build per-window LTP features."""

    @staticmethod
    def load_and_segment(cfg: Config) -> List[np.ndarray]:
        """
        Returns list of arrays, each (T, 5) = [lat, lon, alt, velocity, heading].
        """
        print(f"📂  Loading {cfg.input_csv}")
        cols = ['time', 'icao24', 'lat', 'lon', 'geoaltitude', 'velocity', 'heading']
        df = pd.read_csv(cfg.input_csv, usecols=lambda c: c in cols)
        print(f"   Raw rows : {len(df):,}")
        df.dropna(subset=['lat', 'lon', 'geoaltitude', 'velocity', 'heading'], inplace=True)
        df.sort_values(['icao24', 'time'], inplace=True)

        flights = []
        for _, grp in tqdm(df.groupby('icao24'), desc="Segmenting"):
            if len(grp) < cfg.min_flight_len:
                continue
            arr = grp[['lat', 'lon', 'geoaltitude', 'velocity', 'heading']].values.astype(np.float64)
            # sanity checks
            if np.any(np.abs(arr[:, 0]) > 90) or np.any(np.abs(arr[:, 1]) > 180):
                continue
            if np.any(np.abs(np.diff(arr[:, 0])) > 0.5) or np.any(np.abs(np.diff(arr[:, 1])) > 0.5):
                continue
            flights.append(arr)
            if len(flights) >= cfg.max_flights:
                break

        print(f"   Valid flights : {len(flights):,}")
        return flights

    @staticmethod
    def build_window_features(
        flight: np.ndarray,          # (T, 5)  [lat,lon,alt,vel,hdg]
        start : int,
        cfg   : Config
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        For one sliding window:
          1. Choose the reference point = last point of the input window.
          2. Convert the whole window (input + target) to LTP metres.
          3. Engineer 12 features for the input, 3 targets for output.
          Returns: x (input_window, 12), y (pred_horizon, 3), ref (5,)
        """
        total = cfg.input_window + cfg.pred_horizon
        seg   = flight[start : start + total]               # (90, 5)

        # Reference = last input point
        ref_idx = cfg.input_window - 1
        ref_lat, ref_lon, ref_alt = seg[ref_idx, 0], seg[ref_idx, 1], seg[ref_idx, 2]

        # LTP conversion
        xm, ym, zm = latlon_to_metres(seg[:, 0], seg[:, 1], seg[:, 2],
                                       ref_lat, ref_lon, ref_alt)

        vel = seg[:, 3].astype(np.float32)           # ground speed  (m/s)
        hdg = np.radians(seg[:, 4]).astype(np.float32)
        sin_h = np.sin(hdg)
        cos_h = np.cos(hdg)

        # Velocity components in LTP (discrete differences)
        vx = np.gradient(xm)
        vy = np.gradient(ym)
        vz = np.gradient(zm)

        # Derivatives
        d_speed  = np.gradient(vel)
        d_sin_h  = np.gradient(sin_h)
        d_cos_h  = np.gradient(cos_h)

        features = np.column_stack([
            xm, ym, zm,              # 0-2  position in metres
            vx, vy, vz,              # 3-5  velocity in metres/s
            vel,                      # 6    ground speed
            sin_h, cos_h,            # 7-8  heading (circular)
            d_speed, d_sin_h, d_cos_h # 9-11 derivatives
        ])                            # → (90, 12)

        x_in  = features[:cfg.input_window]                          # (30, 12)
        y_out = features[cfg.input_window:, :3]                      # (60, 3)

        ref = np.array([ref_lat, ref_lon, ref_alt,
                        seg[ref_idx, 3], seg[ref_idx, 4]],
                       dtype=np.float32)                              # (5,)
        return x_in, y_out, ref


# =====================================================================
#  4. DATASET
# =====================================================================

class TrajectoryDataset(Dataset):
    """Sliding-window dataset.  All positions are already in metres (LTP)."""

    def __init__(self, flights: List[np.ndarray], cfg: Config,
                 augment: bool = False):
        self.cfg = cfg
        self.augment = augment
        self.samples: List[Tuple[np.ndarray, np.ndarray, np.ndarray]] = []

        total = cfg.input_window + cfg.pred_horizon
        for fl in tqdm(flights, desc="  Building samples", leave=False):
            if len(fl) < total:
                continue
            for i in range(0, len(fl) - total + 1, cfg.window_step):
                x, y, ref = FlightDataProcessor.build_window_features(fl, i, cfg)
                self.samples.append((x, y, ref))

        print(f"   Samples : {len(self.samples):,}")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        x, y, ref = self.samples[idx]
        x   = torch.as_tensor(x,   dtype=torch.float32)
        y   = torch.as_tensor(y,   dtype=torch.float32)
        ref = torch.as_tensor(ref,  dtype=torch.float32)
        if self.augment and self.cfg.noise_std > 0:
            x = x + torch.randn_like(x) * self.cfg.noise_std
        return x, y, ref


# =====================================================================
#  5. GRU MODEL
# =====================================================================

class FlightGRU(nn.Module):
    """
    3-layer GRU  →  multi-step linear output head.
    Input  : (B, 30, 12)  —  30 s of LTP features
    Output : (B, 60, 3)   —  60 s of (x_m, y_m, z_m) predictions
    """

    def __init__(self, cfg: Config):
        super().__init__()
        self.cfg = cfg

        # Input projection
        self.input_proj = nn.Sequential(
            nn.Linear(cfg.num_input_features, cfg.hidden_size),
            nn.LayerNorm(cfg.hidden_size),
            nn.GELU(),
        )

        # GRU backbone
        self.gru = nn.GRU(
            input_size    = cfg.hidden_size,
            hidden_size   = cfg.hidden_size,
            num_layers    = cfg.num_layers,
            batch_first   = True,
            dropout       = cfg.dropout if cfg.num_layers > 1 else 0.0,
        )

        # Output head  —  takes the LAST hidden state and maps to full horizon
        self.output_head = nn.Sequential(
            nn.Linear(cfg.hidden_size, cfg.hidden_size),
            nn.GELU(),
            nn.Dropout(cfg.dropout * 0.5),
            nn.Linear(cfg.hidden_size, cfg.pred_horizon * cfg.num_output_features),
        )

        self._init_weights()

    def _init_weights(self):
        for name, p in self.named_parameters():
            if 'weight_ih' in name:
                nn.init.xavier_uniform_(p)
            elif 'weight_hh' in name:
                nn.init.orthogonal_(p)
            elif 'bias' in name:
                nn.init.zeros_(p)
            elif p.dim() > 1:
                nn.init.xavier_uniform_(p, gain=0.1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x : (B, 30, 12)
        → : (B, 60, 3)
        """
        h = self.input_proj(x)              # (B, 30, H)
        out, _ = self.gru(h)                # (B, 30, H)
        last = out[:, -1, :]                # (B, H)  — last time step
        pred = self.output_head(last)       # (B, 60*3)
        return pred.view(-1, self.cfg.pred_horizon, self.cfg.num_output_features)


# =====================================================================
#  6. LOSS  — SmoothL1 (Huber) + velocity + endpoint bonus
# =====================================================================

class StableLoss(nn.Module):
    """
    Primary : SmoothL1  on positions  (robust to outliers → stable P90)
    Aux     : SmoothL1  on velocity  (physics smoothness)
    Endpoint: Extra emphasis at t=60 s
    """
    def __init__(self, cfg: Config):
        super().__init__()
        self.huber = nn.SmoothL1Loss(beta=50.0)   # β in metres
        self.endpoint_huber = nn.SmoothL1Loss(beta=100.0)

    def forward(self, pred: torch.Tensor, target: torch.Tensor
                ) -> Tuple[torch.Tensor, Dict[str, float]]:
        # Position loss
        pos_loss = self.huber(pred, target)

        # Velocity consistency
        v_pred   = pred[:, 1:] - pred[:, :-1]
        v_target = target[:, 1:] - target[:, :-1]
        vel_loss = self.huber(v_pred, v_target)

        # Endpoint emphasis  (t = 30 s and t = 60 s)
        ep_loss = (self.endpoint_huber(pred[:, 29, :], target[:, 29, :]) +
                   self.endpoint_huber(pred[:, -1, :], target[:, -1, :])) / 2.0

        total = pos_loss + 2.0 * vel_loss + 1.5 * ep_loss

        return total, {
            'pos':  pos_loss.item(),
            'vel':  vel_loss.item(),
            'ep':   ep_loss.item(),
        }


# =====================================================================
#  7. HAVERSINE EVALUATION
# =====================================================================

def haversine_m(lat1, lon1, lat2, lon2):
    """Vectorised haversine → metres.  Inputs in degrees."""
    R = 6_371_000.0
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2)**2
    return R * 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def evaluate(pred_xyz: np.ndarray, target_xyz: np.ndarray,
             refs: np.ndarray) -> Dict[str, float]:
    """
    pred_xyz   : (N, 60, 3) predicted x/y/z metres
    target_xyz : (N, 60, 3) true x/y/z metres
    refs       : (N, 5)     [ref_lat, ref_lon, ref_alt, ...]

    Convert back to lat/lon and compute haversine at t=30s and t=60s.
    Also compute direct 3-D Euclidean error.
    """
    results = {}
    for tag, tidx in [('30s', 29), ('60s', 59)]:
        px, py, pz = pred_xyz[:, tidx, 0], pred_xyz[:, tidx, 1], pred_xyz[:, tidx, 2]
        tx, ty, tz = target_xyz[:, tidx, 0], target_xyz[:, tidx, 1], target_xyz[:, tidx, 2]
        rlat, rlon, ralt = refs[:, 0], refs[:, 1], refs[:, 2]

        plat, plon, _ = metres_to_latlon(px, py, pz, rlat, rlon, ralt)
        tlat, tlon, _ = metres_to_latlon(tx, ty, tz, rlat, rlon, ralt)

        dist = haversine_m(plat, plon, tlat, tlon)

        results[f'{tag}_mean']   = float(np.mean(dist))
        results[f'{tag}_median'] = float(np.median(dist))
        results[f'{tag}_p90']    = float(np.percentile(dist, 90))
        results[f'{tag}_p95']    = float(np.percentile(dist, 95))

        # 3-D Euclidean
        euc = np.sqrt((px-tx)**2 + (py-ty)**2 + (pz-tz)**2)
        results[f'{tag}_euc_mean'] = float(np.mean(euc))

    return results


# =====================================================================
#  8. TRAINING ENGINE
# =====================================================================

class Trainer:
    def __init__(self, model: nn.Module, cfg: Config):
        self.model  = model
        self.cfg    = cfg
        self.device = torch.device(cfg.device)
        self.criterion = StableLoss(cfg).to(self.device)

        self.optimizer = torch.optim.AdamW(
            model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay,
        )
        # OneCycleLR will be created after we know steps_per_epoch
        self.scheduler = None
        self.scaler = torch.amp.GradScaler(cfg.device, enabled=(cfg.device == 'cuda'))
        self.best_error = float('inf')
        self.patience_counter = 0
        self.history: List[dict] = []

    # -----------------------------------------------------------------
    def _train_epoch(self, loader: DataLoader) -> float:
        self.model.train()
        total, n = 0.0, 0
        for x, y, _ in tqdm(loader, desc="  Train", leave=False):
            x, y = x.to(self.device), y.to(self.device)
            self.optimizer.zero_grad(set_to_none=True)
            with torch.amp.autocast(self.device.type, enabled=(self.device.type == 'cuda')):
                pred = self.model(x)
                loss, _ = self.criterion(pred, y)
            self.scaler.scale(loss).backward()
            self.scaler.unscale_(self.optimizer)
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.cfg.grad_clip)
            self.scaler.step(self.optimizer)
            self.scaler.update()
            if self.scheduler is not None:
                self.scheduler.step()
            total += loss.item(); n += 1
        return total / max(n, 1)

    # -----------------------------------------------------------------
    @torch.no_grad()
    def _validate(self, loader: DataLoader) -> Tuple[float, Dict[str, float]]:
        self.model.eval()
        all_p, all_t, all_r = [], [], []
        total, n = 0.0, 0
        for x, y, ref in tqdm(loader, desc="  Val  ", leave=False):
            x, y = x.to(self.device), y.to(self.device)
            with torch.amp.autocast(self.device.type, enabled=(self.device.type == 'cuda')):
                pred = self.model(x)
                loss, _ = self.criterion(pred, y)
            total += loss.item(); n += 1
            all_p.append(pred.cpu().numpy())
            all_t.append(y.cpu().numpy())
            all_r.append(ref.numpy())
        metrics = evaluate(np.concatenate(all_p), np.concatenate(all_t),
                           np.concatenate(all_r))
        return total / max(n, 1), metrics

    # -----------------------------------------------------------------
    def run(self, train_loader: DataLoader, val_loader: DataLoader) -> List[dict]:
        params = sum(p.numel() for p in self.model.parameters())
        steps  = len(train_loader) * self.cfg.epochs

        # OneCycleLR — single smooth cycle over all training
        self.scheduler = torch.optim.lr_scheduler.OneCycleLR(
            self.optimizer,
            max_lr          = self.cfg.lr,
            total_steps     = steps,
            pct_start       = 0.1,
            anneal_strategy = 'cos',
            div_factor      = 25,
            final_div_factor = 1000,
        )

        print(f"\n{'='*72}")
        print(f"  TRAINING  |  GRU {self.cfg.num_layers}×{self.cfg.hidden_size}  "
              f"|  {params:,} params  |  {self.cfg.device}")
        print(f"  Train: {len(train_loader.dataset):,}   Val: {len(val_loader.dataset):,}  "
              f"|  {self.cfg.epochs} epochs  |  OneCycleLR  max_lr={self.cfg.lr}")
        print(f"{'='*72}\n")

        for ep in range(1, self.cfg.epochs + 1):
            tr_loss = self._train_epoch(train_loader)
            va_loss, metrics = self._validate(val_loader)

            e30  = metrics['30s_mean']
            e60  = metrics['60s_mean']
            p90  = metrics['60s_p90']
            med  = metrics['60s_median']
            lr   = self.optimizer.param_groups[0]['lr']

            self.history.append({
                'epoch': ep, 'train_loss': tr_loss, 'val_loss': va_loss,
                **metrics,
            })

            flag = ""
            if e60 < self.best_error:
                imp = self.best_error - e60
                self.best_error = e60
                self.patience_counter = 0
                torch.save({
                    'model_state': self.model.state_dict(),
                    'config': self.cfg.__dict__,
                    'epoch': ep, 'best_60s_error': e60, 'metrics': metrics,
                }, self.cfg.model_path)
                flag = f"  ★ NEW BEST (-{imp:.0f}m)"
            else:
                self.patience_counter += 1

            print(f"Ep {ep:3d}/{self.cfg.epochs}  lr={lr:.2e}  "
                  f"loss={va_loss:.4f}  "
                  f"30s={e30:.0f}m  60s={e60:.0f}m  "
                  f"med={med:.0f}m  P90={p90:.0f}m{flag}")

            if self.patience_counter >= self.cfg.patience:
                print(f"\n⏹  Early stop at epoch {ep}.  Best 60s: {self.best_error:.0f}m")
                break

        print(f"\n{'='*72}")
        print(f"  DONE  |  Best 60-s mean error : {self.best_error:.0f} m  "
              f"({self.best_error/1000:.2f} km)")
        print(f"{'='*72}\n")
        return self.history


# =====================================================================
#  9. INFERENCE
# =====================================================================

class TrajectoryPredictor:
    """Load trained model and predict from raw flight data."""

    def __init__(self, model_path: str, device: str = None):
        ckpt = torch.load(model_path, map_location='cpu', weights_only=False)
        cd   = ckpt['config']
        self.cfg = Config(**{k: v for k, v in cd.items()
                             if k in Config.__dataclass_fields__})
        if device:
            self.cfg.device = device
        self.device = torch.device(self.cfg.device)
        self.model  = FlightGRU(self.cfg).to(self.device)
        self.model.load_state_dict(ckpt['model_state'])
        self.model.eval()
        print(f"Loaded model  (epoch {ckpt['epoch']}, "
              f"best 60s = {ckpt['best_60s_error']:.0f}m)")

    @torch.no_grad()
    def predict(self, flight_30s: np.ndarray) -> np.ndarray:
        """
        flight_30s : (30, 5)  [lat, lon, alt, velocity, heading]
        Returns    : (60, 3)  [lat, lon, alt]  for next 60 seconds
        """
        cfg = self.cfg
        ref_lat, ref_lon, ref_alt = flight_30s[-1, 0], flight_30s[-1, 1], flight_30s[-1, 2]
        xm, ym, zm = latlon_to_metres(flight_30s[:, 0], flight_30s[:, 1], flight_30s[:, 2],
                                       ref_lat, ref_lon, ref_alt)
        vel = flight_30s[:, 3].astype(np.float32)
        hdg = np.radians(flight_30s[:, 4]).astype(np.float32)
        sin_h, cos_h = np.sin(hdg), np.cos(hdg)
        vx, vy, vz = np.gradient(xm), np.gradient(ym), np.gradient(zm)
        d_speed  = np.gradient(vel)
        d_sin_h  = np.gradient(sin_h)
        d_cos_h  = np.gradient(cos_h)

        feat = np.column_stack([xm, ym, zm, vx, vy, vz,
                                vel, sin_h, cos_h,
                                d_speed, d_sin_h, d_cos_h]).astype(np.float32)

        x = torch.as_tensor(feat, dtype=torch.float32).unsqueeze(0).to(self.device)
        pred_xyz = self.model(x).cpu().numpy()[0]   # (60, 3)

        plat, plon, palt = metres_to_latlon(
            pred_xyz[:, 0], pred_xyz[:, 1], pred_xyz[:, 2],
            ref_lat, ref_lon, ref_alt,
        )
        return np.column_stack([plat, plon, palt])   # (60, 3)


# =====================================================================
#  10. MAIN
# =====================================================================

def main():
    cfg = Config()
    print("=" * 72)
    print(f"  STABLE FLIGHT TRAJECTORY PREDICTOR")
    print(f"  {cfg.input_window}s history  →  {cfg.pred_horizon}s prediction   |   device={cfg.device}")
    print("=" * 72)

    # ---- Load data ----
    flights = FlightDataProcessor.load_and_segment(cfg)
    if not flights:
        raise RuntimeError("No valid flights.  Check input_csv path.")

    # Shuffle deterministically
    rng = np.random.RandomState(42)
    idx = rng.permutation(len(flights))
    flights = [flights[i] for i in idx]

    split = int(len(flights) * cfg.train_split)
    print(f"\n  Train flights: {split}   Val flights: {len(flights)-split}")

    # ---- Build datasets ----
    train_ds = TrajectoryDataset(flights[:split], cfg, augment=True)
    val_ds   = TrajectoryDataset(flights[split:], cfg, augment=False)
    if len(train_ds) == 0 or len(val_ds) == 0:
        raise RuntimeError("Datasets empty — lower min_flight_len or window_step.")

    cuda = (cfg.device == 'cuda')
    train_loader = DataLoader(train_ds, batch_size=cfg.batch_size, shuffle=True,
                              num_workers=2 if cuda else 0,
                              pin_memory=cuda, drop_last=True)
    val_loader   = DataLoader(val_ds,   batch_size=cfg.batch_size * 2, shuffle=False,
                              num_workers=2 if cuda else 0, pin_memory=cuda)

    # ---- Model ----
    model = FlightGRU(cfg).to(cfg.device)

    # ---- Train ----
    trainer = Trainer(model, cfg)
    history = trainer.run(train_loader, val_loader)

    # Save history
    hist_path = os.path.join(cfg.work_dir, "training_history.json")
    with open(hist_path, 'w') as f:
        json.dump(history, f, indent=2, default=str)

    # ---- Final evaluation with best checkpoint ----
    print("\n🔍  Final evaluation (best checkpoint) …")
    ckpt = torch.load(cfg.model_path, map_location=cfg.device, weights_only=False)
    model.load_state_dict(ckpt['model_state'])
    model.eval()
    final_trainer = Trainer(model, cfg)
    _, final = final_trainer._validate(val_loader)

    print(f"\n{'='*72}")
    print(f"  FINAL RESULTS  —  Best Model (epoch {ckpt['epoch']})")
    print(f"{'='*72}")
    print(f"  {'Metric':<30s}  {'Value':>10s}")
    print(f"  {'-'*42}")
    for k in ['30s_mean', '30s_median', '30s_p90',
              '60s_mean', '60s_median', '60s_p90', '60s_p95',
              '60s_euc_mean']:
        v = final[k]
        km = f"  ({v/1000:.2f} km)" if 'mean' in k else ""
        print(f"  {k:<30s}  {v:>8.0f} m{km}")

    ratio = final['60s_p90'] / max(final['60s_mean'], 1)
    print(f"\n  Stability ratio (P90 / Mean) = {ratio:.2f}   "
          f"{'✅ STABLE' if ratio < 1.8 else '⚠️  High variance'}")
    print(f"{'='*72}")


if __name__ == "__main__":
    main()
