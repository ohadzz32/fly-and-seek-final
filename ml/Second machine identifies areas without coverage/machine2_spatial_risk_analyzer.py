"""
Fly and Seek - Spatial Risk Analyzer (Machine 2)

Pipeline:
1. Load and sort telemetry by (icao24, time).
2. Detect dead-zone gaps (1 -> 0 ... -> 1) with duration > 20s.
3. Reconstruct missing shadow points every 10s using dead reckoning
   (velocity + heading) and drift correction to match reconnection point.
4. Convert points to H3 cells (resolution 6 by default).
5. Aggregate risk metrics per H3 cell and export Deck.gl-ready JSON.

Input CSV columns (required):
- time, icao24, x, y, z, velocity, heading, status

Output JSON format:
[
  {
    "h3_index": "861f1d4afffffff",
    "risk_score": 75.2,
    "total_flights": 20,
    "lost_signal_count": 15,
    "avg_alt": 30000.0,
    "confidence_level": "high"
  }
]

Notes:
- If x/y are already lon/lat, script auto-detects and uses them directly.
- If x/y are UTM/projected meters, provide --input-crs (for example EPSG:32636).
- Haversine/geodesic spherical formulas are used for projection calculations.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd

try:
    import h3
except ImportError as exc:
    raise SystemExit(
        "Missing dependency 'h3'. Install with: pip install h3"
    ) from exc

try:
    from pyproj import Transformer
except ImportError:
    Transformer = None

EARTH_RADIUS_M = 6_371_000.0


@dataclass
class Gap:
    entry_idx: int
    exit_idx: int
    entry_time: int
    exit_time: int


@dataclass
class AnalyzerConfig:
    input_csv: Path
    output_json: Path
    h3_resolution: int = 6
    min_gap_seconds: int = 20
    shadow_step_seconds: int = 10
    input_crs: Optional[str] = None
    confidence_low_threshold: int = 5
    confidence_high_threshold: int = 20


def parse_args() -> AnalyzerConfig:
    default_input = Path("Second machine identifies areas without coverage.csv")
    default_output = Path("machine2_h3_risk_output.json")

    parser = argparse.ArgumentParser(
        description="Fly and Seek Spatial Risk Analyzer (Machine 2)"
    )
    parser.add_argument("--input", type=Path, default=default_input, help="Input CSV file path")
    parser.add_argument("--output", type=Path, default=default_output, help="Output JSON file path")
    parser.add_argument("--h3-resolution", type=int, default=6, help="H3 resolution")
    parser.add_argument("--min-gap-seconds", type=int, default=20, help="Minimum gap duration to process")
    parser.add_argument("--shadow-step-seconds", type=int, default=10, help="Shadow point interval in seconds")
    parser.add_argument(
        "--input-crs",
        type=str,
        default=None,
        help="CRS for x/y if projected (example: EPSG:32636). If omitted, x/y must be lon/lat.",
    )
    parser.add_argument("--confidence-low-threshold", type=int, default=5)
    parser.add_argument("--confidence-high-threshold", type=int, default=20)

    args = parser.parse_args()
    return AnalyzerConfig(
        input_csv=args.input,
        output_json=args.output,
        h3_resolution=args.h3_resolution,
        min_gap_seconds=args.min_gap_seconds,
        shadow_step_seconds=args.shadow_step_seconds,
        input_crs=args.input_crs,
        confidence_low_threshold=args.confidence_low_threshold,
        confidence_high_threshold=args.confidence_high_threshold,
    )


def load_and_prepare(csv_path: Path) -> pd.DataFrame:
    required = ["time", "icao24", "x", "y", "z", "velocity", "heading", "status"]

    df = pd.read_csv(csv_path)
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df = df[required].copy()
    df["time"] = pd.to_numeric(df["time"], errors="coerce").astype("Int64")
    df["icao24"] = df["icao24"].astype(str)
    for c in ["x", "y", "z", "velocity", "heading", "status"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df = df.dropna(subset=required)
    df["time"] = df["time"].astype(np.int64)
    df["status"] = df["status"].astype(np.int8)

    # Ensure deterministic chronology and clean duplicates.
    df = df.sort_values(["icao24", "time"], kind="mergesort")
    df = df.drop_duplicates(subset=["icao24", "time"], keep="last")
    df = df.reset_index(drop=True)
    return df


def xy_looks_like_lon_lat(x: pd.Series, y: pd.Series) -> bool:
    x_ok = x.between(-180, 180).mean() > 0.995
    y_ok = y.between(-90, 90).mean() > 0.995
    return bool(x_ok and y_ok)


def convert_xy_to_lon_lat(df: pd.DataFrame, input_crs: Optional[str]) -> pd.DataFrame:
    out = df.copy()

    if xy_looks_like_lon_lat(out["x"], out["y"]):
        out["lon"] = out["x"].astype(float)
        out["lat"] = out["y"].astype(float)
        return out

    if not input_crs:
        raise ValueError(
            "x/y are not lon/lat. Provide --input-crs (for example EPSG:32636 for UTM)."
        )

    if Transformer is None:
        raise ValueError(
            "pyproj is required for projected coordinates. Install with: pip install pyproj"
        )

    transformer = Transformer.from_crs(input_crs, "EPSG:4326", always_xy=True)
    lon, lat = transformer.transform(out["x"].to_numpy(), out["y"].to_numpy())
    out["lon"] = lon
    out["lat"] = lat
    return out


def normalize_heading_deg(heading_deg: float) -> float:
    return float(heading_deg % 360.0)


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_M * c


def geodesic_project(lat: float, lon: float, heading_deg: float, distance_m: float) -> Tuple[float, float]:
    """Project point using spherical Earth + bearing (Haversine-compatible model)."""
    if distance_m == 0:
        return lat, lon

    brng = math.radians(normalize_heading_deg(heading_deg))
    phi1 = math.radians(lat)
    lam1 = math.radians(lon)
    ang_dist = distance_m / EARTH_RADIUS_M

    sin_phi2 = math.sin(phi1) * math.cos(ang_dist) + math.cos(phi1) * math.sin(ang_dist) * math.cos(brng)
    phi2 = math.asin(max(-1.0, min(1.0, sin_phi2)))

    y = math.sin(brng) * math.sin(ang_dist) * math.cos(phi1)
    x = math.cos(ang_dist) - math.sin(phi1) * math.sin(phi2)
    lam2 = lam1 + math.atan2(y, x)

    lat2 = math.degrees(phi2)
    lon2 = math.degrees(lam2)
    lon2 = ((lon2 + 180.0) % 360.0) - 180.0
    return lat2, lon2


def detect_gaps_for_flight(group: pd.DataFrame, min_gap_seconds: int) -> List[Gap]:
    status = group["status"].to_numpy(dtype=np.int8)
    times = group["time"].to_numpy(dtype=np.int64)
    n = len(group)
    gaps: List[Gap] = []

    i = 1
    while i < n - 1:
        if status[i - 1] == 1 and status[i] == 0:
            k = i
            while k < n and status[k] == 0:
                k += 1

            if k < n and status[k] == 1:
                entry_idx = i - 1
                exit_idx = k
                dt = int(times[exit_idx] - times[entry_idx])
                if dt > min_gap_seconds:
                    gaps.append(
                        Gap(
                            entry_idx=entry_idx,
                            exit_idx=exit_idx,
                            entry_time=int(times[entry_idx]),
                            exit_time=int(times[exit_idx]),
                        )
                    )
                i = k
                continue
        i += 1

    return gaps


def reconstruct_shadow_points_for_gap(
    group: pd.DataFrame,
    gap: Gap,
    shadow_step_seconds: int,
) -> pd.DataFrame:
    entry = group.iloc[gap.entry_idx]
    exit_ = group.iloc[gap.exit_idx]

    entry_t = int(entry["time"])
    exit_t = int(exit_["time"])
    gap_duration = exit_t - entry_t

    shadow_times = np.arange(entry_t + shadow_step_seconds, exit_t, shadow_step_seconds, dtype=np.int64)
    if shadow_times.size == 0:
        return pd.DataFrame(columns=["time", "icao24", "lat", "lon", "z", "status", "is_shadow"])

    speed = float(max(0.0, entry["velocity"]))
    heading = float(entry["heading"]) if not pd.isna(entry["heading"]) else 0.0
    entry_lat = float(entry["lat"])
    entry_lon = float(entry["lon"])
    entry_z = float(entry["z"])
    exit_lat = float(exit_["lat"])
    exit_lon = float(exit_["lon"])
    exit_z = float(exit_["z"])

    proj_lats: List[float] = []
    proj_lons: List[float] = []
    proj_zs: List[float] = []

    # Dead reckoning using entry speed+heading for each shadow time.
    for t in shadow_times:
        dt = float(t - entry_t)
        distance_m = speed * dt
        lat_i, lon_i = geodesic_project(entry_lat, entry_lon, heading, distance_m)
        proj_lats.append(lat_i)
        proj_lons.append(lon_i)
        proj_zs.append(entry_z)

    # Predicted end point for full gap duration (used for drift correction).
    pred_end_lat, pred_end_lon = geodesic_project(entry_lat, entry_lon, heading, speed * float(gap_duration))
    pred_end_z = entry_z

    # Linear drift correction so trajectory connects exactly to real exit point.
    lat_err = exit_lat - pred_end_lat
    lon_err = exit_lon - pred_end_lon
    z_err = exit_z - pred_end_z

    corrected_lats: List[float] = []
    corrected_lons: List[float] = []
    corrected_zs: List[float] = []

    for t, lat_i, lon_i, z_i in zip(shadow_times, proj_lats, proj_lons, proj_zs):
        alpha = float(t - entry_t) / float(gap_duration)
        corrected_lats.append(lat_i + alpha * lat_err)
        corrected_lons.append(lon_i + alpha * lon_err)
        corrected_zs.append(z_i + alpha * z_err)

    return pd.DataFrame(
        {
            "time": shadow_times,
            "icao24": entry["icao24"],
            "lat": corrected_lats,
            "lon": corrected_lons,
            "z": corrected_zs,
            "status": np.zeros_like(shadow_times, dtype=np.int8),
            "is_shadow": np.ones_like(shadow_times, dtype=np.int8),
        }
    )


def _h3_cell(lat: float, lon: float, resolution: int) -> str:
    if hasattr(h3, "latlng_to_cell"):
        return h3.latlng_to_cell(lat, lon, resolution)
    if hasattr(h3, "geo_to_h3"):
        return h3.geo_to_h3(lat, lon, resolution)
    raise RuntimeError("Unsupported h3 Python API version.")


def confidence_level(total_flights: int, low: int, high: int) -> str:
    if total_flights < low:
        return "low"
    if total_flights < high:
        return "medium"
    return "high"


def aggregate_h3_risk(points: pd.DataFrame, cfg: AnalyzerConfig) -> pd.DataFrame:
    if points.empty:
        return pd.DataFrame(
            columns=[
                "h3_index",
                "risk_score",
                "total_flights",
                "lost_signal_count",
                "avg_alt",
                "confidence_level",
            ]
        )

    points = points.copy()
    points["h3_index"] = [
        _h3_cell(float(lat), float(lon), cfg.h3_resolution)
        for lat, lon in zip(points["lat"].to_numpy(), points["lon"].to_numpy())
    ]

    total_flights = points.groupby("h3_index")["icao24"].nunique().rename("total_flights")

    lost_points = points[points["status"] == 0]
    lost_flights = lost_points.groupby("h3_index")["icao24"].nunique().rename("lost_signal_count")

    avg_alt = points.groupby("h3_index")["z"].mean().rename("avg_alt")

    merged = pd.concat([total_flights, lost_flights, avg_alt], axis=1).fillna(0.0).reset_index()
    merged["total_flights"] = merged["total_flights"].astype(int)
    merged["lost_signal_count"] = merged["lost_signal_count"].astype(int)

    merged["risk_score"] = np.where(
        merged["total_flights"] > 0,
        (merged["lost_signal_count"] / merged["total_flights"]) * 100.0,
        0.0,
    )

    merged["confidence_level"] = merged["total_flights"].apply(
        lambda n: confidence_level(int(n), cfg.confidence_low_threshold, cfg.confidence_high_threshold)
    )

    merged = merged[
        [
            "h3_index",
            "risk_score",
            "total_flights",
            "lost_signal_count",
            "avg_alt",
            "confidence_level",
        ]
    ].sort_values("risk_score", ascending=False, kind="mergesort")

    merged["risk_score"] = merged["risk_score"].round(2)
    merged["avg_alt"] = merged["avg_alt"].round(2)

    return merged


def run_pipeline(cfg: AnalyzerConfig) -> Tuple[pd.DataFrame, Dict[str, int]]:
    df = load_and_prepare(cfg.input_csv)
    df = convert_xy_to_lon_lat(df, cfg.input_crs)

    original_points = df[["time", "icao24", "lat", "lon", "z", "status"]].copy()
    original_points["is_shadow"] = np.zeros(len(original_points), dtype=np.int8)

    shadow_parts: List[pd.DataFrame] = []
    gap_count = 0

    for _, group in df.groupby("icao24", sort=False):
        if len(group) < 3:
            continue

        gaps = detect_gaps_for_flight(group, cfg.min_gap_seconds)
        gap_count += len(gaps)

        for gap in gaps:
            shadow_df = reconstruct_shadow_points_for_gap(group, gap, cfg.shadow_step_seconds)
            if not shadow_df.empty:
                shadow_parts.append(shadow_df)

    if shadow_parts:
        shadow_points = pd.concat(shadow_parts, axis=0, ignore_index=True)
    else:
        shadow_points = pd.DataFrame(columns=["time", "icao24", "lat", "lon", "z", "status", "is_shadow"])

    all_points = pd.concat([original_points, shadow_points], axis=0, ignore_index=True)
    all_points = all_points.dropna(subset=["lat", "lon", "z"])

    risk_df = aggregate_h3_risk(all_points, cfg)

    stats = {
        "input_rows": int(len(df)),
        "shadow_points": int(len(shadow_points)),
        "total_points_for_h3": int(len(all_points)),
        "detected_gaps": int(gap_count),
        "h3_cells": int(len(risk_df)),
    }
    return risk_df, stats


def export_json(risk_df: pd.DataFrame, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    records = risk_df.to_dict(orient="records")
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=True, indent=2)


def main() -> None:
    cfg = parse_args()
    risk_df, stats = run_pipeline(cfg)
    export_json(risk_df, cfg.output_json)

    print("Spatial risk analysis completed.")
    print(f"Input rows: {stats['input_rows']}")
    print(f"Detected qualifying gaps: {stats['detected_gaps']}")
    print(f"Reconstructed shadow points: {stats['shadow_points']}")
    print(f"Total points indexed in H3: {stats['total_points_for_h3']}")
    print(f"Output H3 cells: {stats['h3_cells']}")
    print(f"JSON written to: {cfg.output_json}")


if __name__ == "__main__":
    main()
