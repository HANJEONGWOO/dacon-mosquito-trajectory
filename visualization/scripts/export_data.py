#!/usr/bin/env python3
"""Export test trajectories and model predictions for the browser visualizer."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_ROOT = ROOT / "data" / "open"
DEFAULT_OUTPUT = ROOT / "visualization" / "public" / "data" / "trajectories.json"
PREDICTION_FILES = {
    "best": ROOT / "outputs" / "submission_best.csv",
    "physics": ROOT / "outputs" / "submission_physics.csv",
    "ensemble": ROOT / "outputs" / "submission_ensemble.csv",
}
OOF_FILES = {
    "ridge": ROOT / "outputs" / "oof" / "strong_ridge_folds5_seed42.npy",
    "extra_trees": ROOT / "outputs" / "oof" / "strong_extra_trees_folds5_seed42.npy",
    "xgboost": ROOT / "outputs" / "oof" / "strong_xgboost_folds5_seed42.npy",
    "catboost": ROOT / "outputs" / "oof" / "strong_catboost_folds5_seed42.npy",
}
REPORT_PATH = ROOT / "outputs" / "report.json"
HIT_RADIUS_METERS = 0.01


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
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


def build_submission_samples(
    data_root: Path,
    limit: int | None,
) -> tuple[list[int], list[dict[str, object]]]:
    prediction_sets = {name: load_predictions(path) for name, path in PREDICTION_FILES.items()}
    paths = sorted((data_root / "test").glob("TEST_*.csv"))
    paths = paths if limit is None else paths[:limit]
    if not paths:
        raise FileNotFoundError(f"No test trajectory CSV files found in {data_root / 'test'}")

    expected_timesteps: list[int] | None = None
    samples = []
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
    return expected_timesteps or [], samples


def load_training_labels(path: Path) -> tuple[list[str], np.ndarray]:
    ids: list[str] = []
    labels: list[list[float]] = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            ids.append(row["id"])
            labels.append([float(row["x"]), float(row["y"]), float(row["z"])])
    return ids, np.asarray(labels, dtype=np.float64)


def build_validation_samples(
    data_root: Path,
    limit: int | None,
) -> tuple[list[int], list[dict[str, object]], dict[str, float]]:
    if not REPORT_PATH.exists():
        raise FileNotFoundError(f"Model report not found: {REPORT_PATH}")
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    params = report["params"]
    speed = float(params["speed"])
    accel = float(params["accel"])
    xgboost_scale = float(params["residual_scales"]["xgboost"])
    ensemble_weights = params["weights"]

    train_ids, actual = load_training_labels(data_root / "train_labels.csv")
    residuals = {}
    for name, path in OOF_FILES.items():
        if not path.exists():
            raise FileNotFoundError(f"OOF prediction not found: {path}")
        residuals[name] = np.load(path)
        if residuals[name].shape != actual.shape:
            raise ValueError(f"{path.name}: expected shape {actual.shape}, found {residuals[name].shape}")

    all_observed: list[list[list[float]]] = []
    expected_timesteps: list[int] | None = None
    for sample_id in train_ids:
        path = data_root / "train" / f"{sample_id}.csv"
        timesteps, observed = load_trajectory(path)
        if expected_timesteps is None:
            expected_timesteps = timesteps
        elif timesteps != expected_timesteps:
            raise ValueError(f"{path.name}: inconsistent timesteps")
        all_observed.append(observed)

    observed_array = np.asarray(all_observed, dtype=np.float64)
    last = observed_array[:, -1]
    velocity = observed_array[:, -1] - observed_array[:, -2]
    acceleration = observed_array[:, -1] - 2.0 * observed_array[:, -2] + observed_array[:, -3]
    physics = last + speed * velocity + accel * acceleration
    best = physics + xgboost_scale * residuals["xgboost"]
    ensemble_residual = np.zeros_like(physics)
    for name, weight in ensemble_weights.items():
        ensemble_residual += float(weight) * residuals[name]
    ensemble = physics + ensemble_residual
    predictions = {"best": best, "physics": physics, "ensemble": ensemble}

    count = len(train_ids) if limit is None else min(limit, len(train_ids))
    samples = []
    for index in range(count):
        samples.append(
            {
                "id": train_ids[index],
                "observed": all_observed[index],
                "actual": [round(float(value), 9) for value in actual[index]],
                "predictions": {
                    name: [round(float(value), 9) for value in values[index]]
                    for name, values in predictions.items()
                },
            }
        )

    scores = {
        name: float(np.mean(np.linalg.norm(values - actual, axis=1) <= HIT_RADIUS_METERS))
        for name, values in predictions.items()
    }
    return expected_timesteps or [], samples, scores


def main() -> None:
    args = parse_args()
    validation_timesteps, validation_samples, validation_scores = build_validation_samples(
        args.data_root,
        args.limit,
    )
    submission_timesteps, submission_samples = build_submission_samples(
        args.data_root,
        args.limit,
    )
    if validation_timesteps != submission_timesteps:
        raise ValueError("Train and test trajectory timesteps do not match")

    payload = {
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "coordinateSystem": {"x": "forward", "y": "left", "z": "up"},
            "scenario": "Fictional UAV reinterpretation of DACON mosquito trajectories",
            "hitRadiusMeters": HIT_RADIUS_METERS,
            "validationScores": validation_scores,
        },
        "timesteps": validation_timesteps,
        "datasets": {
            "validation": {
                "label": "5-fold OOF validation",
                "hasGroundTruth": True,
                "samples": validation_samples,
            },
            "submission": {
                "label": "DACON test submission",
                "hasGroundTruth": False,
                "samples": submission_samples,
            },
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))

    size_mb = args.output.stat().st_size / (1024 * 1024)
    print(
        f"Exported {len(validation_samples):,} validation and "
        f"{len(submission_samples):,} submission tracks to {args.output} ({size_mb:.2f} MB)"
    )
    print(
        "Validation R-Hit@1cm: "
        + ", ".join(f"{name}={score:.4f}" for name, score in validation_scores.items())
    )


if __name__ == "__main__":
    main()
