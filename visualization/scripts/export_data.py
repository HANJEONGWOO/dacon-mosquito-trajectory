#!/usr/bin/env python3
"""Export test trajectories and model predictions for the browser visualizer."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = ROOT / "data" / "open" / "test"
DEFAULT_OUTPUT = ROOT / "visualization" / "public" / "data" / "trajectories.json"
PREDICTION_FILES = {
    "best": ROOT / "outputs" / "submission_best.csv",
    "physics": ROOT / "outputs" / "submission_physics.csv",
    "ensemble": ROOT / "outputs" / "submission_ensemble.csv",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


def load_predictions(path: Path) -> dict[str, list[float]]:
    if not path.exists():
        raise FileNotFoundError(f"Prediction file not found: {path}")

    predictions: dict[str, list[float]] = {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            predictions[row["id"]] = [
                round(float(row["x"]), 9),
                round(float(row["y"]), 9),
                round(float(row["z"]), 9),
            ]
    return predictions


def load_trajectory(path: Path) -> tuple[list[int], list[list[float]]]:
    timesteps: list[int] = []
    points: list[list[float]] = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            timesteps.append(int(row["timestep_ms"]))
            points.append(
                [
                    round(float(row["x"]), 6),
                    round(float(row["y"]), 6),
                    round(float(row["z"]), 6),
                ]
            )

    if len(points) != 11:
        raise ValueError(f"{path.name}: expected 11 observations, found {len(points)}")
    return timesteps, points


def main() -> None:
    args = parse_args()
    prediction_sets = {
        name: load_predictions(path) for name, path in PREDICTION_FILES.items()
    }
    paths = sorted(args.data_dir.glob("TEST_*.csv"))
    if args.limit is not None:
        paths = paths[: args.limit]
    if not paths:
        raise FileNotFoundError(f"No test trajectory CSV files found in {args.data_dir}")

    samples = []
    expected_timesteps: list[int] | None = None
    for path in paths:
        sample_id = path.stem
        timesteps, observed = load_trajectory(path)
        if expected_timesteps is None:
            expected_timesteps = timesteps
        elif timesteps != expected_timesteps:
            raise ValueError(f"{path.name}: inconsistent timesteps")

        missing = [name for name, values in prediction_sets.items() if sample_id not in values]
        if missing:
            raise KeyError(f"{sample_id}: missing predictions for {', '.join(missing)}")

        samples.append(
            {
                "id": sample_id,
                "observed": observed,
                "predictions": {
                    name: values[sample_id] for name, values in prediction_sets.items()
                },
            }
        )

    payload = {
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "coordinateSystem": {"x": "forward", "y": "left", "z": "up"},
            "scenario": "Fictional UAV reinterpretation of DACON mosquito trajectories",
            "sampleCount": len(samples),
        },
        "timesteps": expected_timesteps,
        "samples": samples,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))

    size_mb = args.output.stat().st_size / (1024 * 1024)
    print(f"Exported {len(samples):,} tracks to {args.output} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
