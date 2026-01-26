"""
Flight Trajectory Prediction - Anti-Overfitting Focus
Key insight: LSTM memorizes patterns -> need noise injection + simpler model
"""
import argparse
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import StandardScaler
from dataclasses import dataclass
from pathlib import Path
from tqdm import tqdm
import pickle
import math

@dataclass
class Config:
    window: int = 20          # Shorter window worked best
    horizon: int = 5
    hidden: int = 64          # Small but effective
    layers: int = 1           # Single layer
    dropout: float = 0.5      # Aggressive dropout
    lr: float = 0.001
    weight_decay: float = 1e-3
    batch: int = 512          # Large batch
    noise_std: float = 0.02   # Noise injection
    epochs: int = 200
    patience: int = 50
    min_seq_len: int = 40

class FlightDataset(Dataset):
    def __init__(self, X, y, base_pos, noise_std=0.0, training=True):
        self.X = torch.FloatTensor(X)
        self.y = torch.FloatTensor(y)
        self.base_pos = torch.FloatTensor(base_pos)
        self.noise_std = noise_std
        self.training = training
        
    def __len__(self): return len(self.X)
    
    def __getitem__(self, i):
        x = self.X[i]
        if self.training and self.noise_std > 0:
            x = x + torch.randn_like(x) * self.noise_std
        return x, self.y[i], self.base_pos[i]

def load_data(path: str, cfg: Config):
    """Load with delta prediction target"""
    df = pd.read_csv(path)
    df = df.sort_values(['icao24', 'time']).reset_index(drop=True)
    
    # Core features
    features = ['lat', 'lon', 'velocity', 'heading', 'vertrate']
    df[features] = df[features].ffill().bfill().fillna(0)
    
    # Cyclical heading
    heading_rad = np.deg2rad(df['heading'].values)
    df['sin_h'] = np.sin(heading_rad)
    df['cos_h'] = np.cos(heading_rad)
    
    # Velocity components
    df['vx'] = df['velocity'] * df['cos_h']
    df['vy'] = df['velocity'] * df['sin_h']
    
    # Compute deltas for targets
    df['d_lat'] = df.groupby('icao24')['lat'].diff().fillna(0)
    df['d_lon'] = df.groupby('icao24')['lon'].diff().fillna(0)
    
    # Feature set
    feature_cols = ['lat', 'lon', 'vx', 'vy', 'vertrate', 'sin_h', 'cos_h']
    target_cols = ['d_lat', 'd_lon']  # Predict deltas instead of absolute
    
    # StandardScaler
    scaler = StandardScaler()
    target_scaler = StandardScaler()
    
    df[feature_cols] = scaler.fit_transform(df[feature_cols])
    df[target_cols] = target_scaler.fit_transform(df[target_cols])
    
    # Per-aircraft sequence generation
    X_all, y_all, base_pos = [], [], []
    total_win = cfg.window + cfg.horizon
    
    for icao, grp in df.groupby('icao24'):
        if len(grp) < cfg.min_seq_len:
            continue
        arr_feat = grp[feature_cols].values
        arr_target = grp[target_cols].values
        # Store raw lat/lon for reconstruction
        arr_raw = grp[['lat', 'lon']].values
        
        for i in range(len(arr_feat) - total_win + 1):
            X_all.append(arr_feat[i:i+cfg.window])
            y_all.append(arr_target[i+cfg.window:i+total_win])
            # Store last position of input window (normalized)
            base_pos.append(arr_feat[i+cfg.window-1, :2])
    
    X_all = np.array(X_all)
    y_all = np.array(y_all)
    base_pos = np.array(base_pos)
    
    # Shuffle before split
    idx = np.random.permutation(len(X_all))
    X_all, y_all, base_pos = X_all[idx], y_all[idx], base_pos[idx]
    
    split = int(0.8 * len(X_all))
    print(f"Data: {len(X_all)} sequences | Train: {split} | Val: {len(X_all)-split}")
    print(f"Features: {feature_cols} | Target: {target_cols}")
    
    return (X_all[:split], y_all[:split], base_pos[:split]), \
           (X_all[split:], y_all[split:], base_pos[split:]), \
           (scaler, target_scaler)

class FlightLSTM(nn.Module):
    """LSTM with temporal attention"""
    def __init__(self, input_size: int, cfg: Config):
        super().__init__()
        self.cfg = cfg
        
        self.lstm = nn.LSTM(
            input_size, cfg.hidden, cfg.layers,
            batch_first=True, dropout=0
        )
        
        # Temporal attention - learn which timesteps matter most
        self.attn = nn.Sequential(
            nn.Linear(cfg.hidden, cfg.hidden // 2),
            nn.Tanh(),
            nn.Linear(cfg.hidden // 2, 1, bias=False)
        )
        
        self.dropout = nn.Dropout(cfg.dropout)
        self.fc = nn.Linear(cfg.hidden, cfg.horizon * 2)
        
        self._init_weights()
    
    def _init_weights(self):
        for name, param in self.lstm.named_parameters():
            if 'weight_ih' in name:
                nn.init.xavier_uniform_(param)
            elif 'weight_hh' in name:
                nn.init.orthogonal_(param)
            elif 'bias' in name:
                nn.init.zeros_(param)
        nn.init.xavier_uniform_(self.fc.weight)
        nn.init.zeros_(self.fc.bias)
    
    def forward(self, x):
        out, _ = self.lstm(x)  # (batch, seq, hidden)
        
        # Attention weights over time
        attn_weights = self.attn(out).squeeze(-1)  # (batch, seq)
        attn_weights = torch.softmax(attn_weights, dim=-1)
        
        # Weighted sum of LSTM outputs
        context = torch.bmm(attn_weights.unsqueeze(1), out).squeeze(1)  # (batch, hidden)
        
        context = self.dropout(context)
        out = self.fc(context)
        return out.view(-1, self.cfg.horizon, 2)

def haversine_km(lat1, lon1, lat2, lon2):
    """Vectorized haversine distance in km"""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    return 2 * R * np.arcsin(np.sqrt(np.clip(a, 0, 1)))

class Trainer:
    def __init__(self, model, train_data, val_data, scalers, cfg: Config):
        self.model = model
        self.cfg = cfg
        self.scaler, self.target_scaler = scalers
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model.to(self.device)
        
        # Training with noise injection
        self.train_loader = DataLoader(
            FlightDataset(*train_data, noise_std=cfg.noise_std, training=True),
            batch_size=cfg.batch, shuffle=True
        )
        # Validation without noise
        self.val_loader = DataLoader(
            FlightDataset(*val_data, noise_std=0, training=False),
            batch_size=cfg.batch
        )
        
        # Optimizer with strong L2 regularization
        self.optimizer = torch.optim.AdamW(
            model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay
        )
        
        # Stable LR schedule - reduce on plateau
        self.scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode='min', factor=0.5, patience=5, min_lr=1e-6
        )
        
        self.criterion = nn.MSELoss()
        self.best_dist = float('inf')
        self.no_improve = 0
    
    def train_epoch(self, epoch):
        self.model.train()
        total_loss = 0
        pbar = tqdm(self.train_loader, desc=f"Epoch {epoch}", leave=False)
        
        for X, y, _ in pbar:
            X, y = X.to(self.device), y.to(self.device)
            
            self.optimizer.zero_grad()
            pred = self.model(X)
            loss = self.criterion(pred, y)
            
            # Gradient clipping for stability
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()
            
            total_loss += loss.item()
            pbar.set_postfix({'loss': f'{loss.item():.6f}'})
        
        return total_loss / len(self.train_loader)
    
    def validate(self):
        self.model.eval()
        all_pred, all_true, all_base = [], [], []
        total_loss = 0
        
        with torch.no_grad():
            for X, y, base in self.val_loader:
                X, y = X.to(self.device), y.to(self.device)
                pred = self.model(X)
                total_loss += self.criterion(pred, y).item()
                all_pred.append(pred.cpu().numpy())
                all_true.append(y.cpu().numpy())
                all_base.append(base.numpy())
        
        pred_delta = np.concatenate(all_pred)
        true_delta = np.concatenate(all_true)
        base = np.concatenate(all_base)
        
        # Inverse transform deltas
        d_lat_mean, d_lat_std = self.target_scaler.mean_[0], self.target_scaler.scale_[0]
        d_lon_mean, d_lon_std = self.target_scaler.mean_[1], self.target_scaler.scale_[1]
        
        pred_d_lat = pred_delta[:, :, 0] * d_lat_std + d_lat_mean
        pred_d_lon = pred_delta[:, :, 1] * d_lon_std + d_lon_mean
        true_d_lat = true_delta[:, :, 0] * d_lat_std + d_lat_mean
        true_d_lon = true_delta[:, :, 1] * d_lon_std + d_lon_mean
        
        # Inverse transform base positions
        lat_mean, lat_std = self.scaler.mean_[0], self.scaler.scale_[0]
        lon_mean, lon_std = self.scaler.mean_[1], self.scaler.scale_[1]
        
        base_lat = base[:, 0:1] * lat_std + lat_mean
        base_lon = base[:, 1:2] * lon_std + lon_mean
        
        # Reconstruct absolute positions by cumulative sum of deltas
        pred_lat = base_lat + np.cumsum(pred_d_lat, axis=1)
        pred_lon = base_lon + np.cumsum(pred_d_lon, axis=1)
        true_lat = base_lat + np.cumsum(true_d_lat, axis=1)
        true_lon = base_lon + np.cumsum(true_d_lon, axis=1)
        
        distances = haversine_km(pred_lat, pred_lon, true_lat, true_lon)
        mean_dist = distances.mean()
        
        val_loss = total_loss / len(self.val_loader)
        return val_loss, mean_dist
    
    def fit(self):
        print(f"\nTraining on {self.device} | Model params: {sum(p.numel() for p in self.model.parameters()):,}")
        print(f"Config: window={self.cfg.window}, hidden={self.cfg.hidden}, dropout={self.cfg.dropout}")
        print(f"        noise_std={self.cfg.noise_std}, weight_decay={self.cfg.weight_decay}\n")
        
        for epoch in range(1, self.cfg.epochs + 1):
            train_loss = self.train_epoch(epoch)
            val_loss, mean_dist = self.validate()
            
            lr = self.optimizer.param_groups[0]['lr']
            print(f"Epoch {epoch:3d} | Train: {train_loss:.6f} | Val: {val_loss:.6f} | "
                  f"Dist: {mean_dist:.2f}km | LR: {lr:.2e}")
            
            if mean_dist < self.best_dist:
                self.best_dist = mean_dist
                self.no_improve = 0
                self.save_checkpoint()
                print(f"         ✓ New best: {mean_dist:.2f}km")
            else:
                self.no_improve += 1
            
            # Step scheduler based on validation loss
            self.scheduler.step(val_loss)
            
            if self.no_improve >= self.cfg.patience:
                print(f"\nEarly stopping at epoch {epoch}")
                break
        
        print(f"\n{'='*50}")
        print(f"Training complete! Best distance: {self.best_dist:.2f}km")
        return self.best_dist
    
    def save_checkpoint(self):
        path = Path('ml/artifacts')
        path.mkdir(parents=True, exist_ok=True)
        torch.save({
            'model': self.model.state_dict(),
            'config': self.cfg,
            'scaler': self.scaler,
            'target_scaler': self.target_scaler
        }, path / 'best_model.pt')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', required=True, help='Path to CSV')
    parser.add_argument('--epochs', type=int, default=150)
    parser.add_argument('--patience', type=int, default=30)
    parser.add_argument('--window', type=int, default=30)
    parser.add_argument('--hidden', type=int, default=128)
    parser.add_argument('--dropout', type=float, default=0.4)
    args = parser.parse_args()
    
    cfg = Config(
        epochs=args.epochs, patience=args.patience, 
        window=args.window, hidden=args.hidden, dropout=args.dropout
    )
    
    torch.manual_seed(42)
    np.random.seed(42)
    
    train_data, val_data, scalers = load_data(args.data, cfg)
    model = FlightLSTM(input_size=7, cfg=cfg)  # 7 features
    trainer = Trainer(model, train_data, val_data, scalers, cfg)
    trainer.fit()

if __name__ == '__main__':
    main()
