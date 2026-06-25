#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "open"
OOF_DIR = ROOT / "outputs" / "oof"
REPORT_PATH = ROOT / "outputs" / "report.json"
FIGURE_DIR = ROOT / "docs" / "figures"


def physics_predict(x: np.ndarray, speed_scale: float, accel_scale: float) -> np.ndarray:
    last = x[:, -1]
    velocity = x[:, -1] - x[:, -2]
    acceleration = x[:, -1] - 2.0 * x[:, -2] + x[:, -3]
    return last + speed_scale * velocity + accel_scale * acceleration


def load_context() -> tuple[dict, np.ndarray, np.ndarray, np.ndarray, dict[str, np.ndarray]]:
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    arrays = np.load(DATA_DIR / "_arrays_v1.npz")
    x_train = arrays["x_train"]
    labels = pd.read_csv(DATA_DIR / "train_labels.csv")
    y_train = labels[["x", "y", "z"]].to_numpy(np.float64)

    speed = report["params"]["speed"]
    accel = report["params"]["accel"]
    base = physics_predict(x_train, speed, accel)

    scales = report["params"]["residual_scales"]
    preds = {
        "Physics": base,
        "ExtraTrees": base
        + scales["extra_trees"] * np.load(OOF_DIR / "strong_extra_trees_folds5_seed42.npy"),
        "XGBoost": base
        + scales["xgboost"] * np.load(OOF_DIR / "strong_xgboost_folds5_seed42.npy"),
        "CatBoost": base
        + scales["catboost"] * np.load(OOF_DIR / "strong_catboost_folds5_seed42.npy"),
    }

    weights = report["params"]["weights"]
    ensemble_residual = np.zeros_like(base)
    for name, weight in weights.items():
        ensemble_residual += weight * np.load(OOF_DIR / f"strong_{name}_folds5_seed42.npy")
    preds["Weighted Ensemble"] = base + ensemble_residual

    return report, x_train, y_train, base, preds


def distance(pred: np.ndarray, true: np.ndarray) -> np.ndarray:
    return np.linalg.norm(pred - true, axis=1)


def savefig(name: str) -> None:
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    path = FIGURE_DIR / name
    plt.savefig(path, dpi=180, bbox_inches="tight")
    plt.close()
    print(f"saved {path.relative_to(ROOT)}")


def plot_performance(report: dict) -> None:
    scores = report["scores"]
    names = [
        "Physics",
        "Ridge",
        "ExtraTrees",
        "XGBoost",
        "Ensemble",
        "Public LB",
    ]
    values = [
        scores["physics"]["r_hit_1cm"],
        scores["ridge_scaled"]["r_hit_1cm"],
        scores["extra_trees_scaled"]["r_hit_1cm"],
        scores["xgboost_scaled"]["r_hit_1cm"],
        scores["oof_ensemble"]["r_hit_1cm"],
        0.638,
    ]
    colors = ["#8a8f98", "#9bb7d4", "#5fa8d3", "#0b6e99", "#58a55c", "#f2a23a"]

    fig, ax = plt.subplots(figsize=(10.5, 5.6))
    bars = ax.bar(names, values, color=colors, edgecolor="#263238", linewidth=0.8)
    ax.set_ylim(0.56, 0.65)
    ax.set_ylabel("R-Hit@1cm")
    ax.set_title("Model Comparison: Validation vs Public Leaderboard")
    ax.grid(axis="y", alpha=0.25)
    ax.spines[["top", "right"]].set_visible(False)
    for bar, value in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            value + 0.002,
            f"{value:.4f}" if value < 0.638 else f"{value:.3f}",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
        )
    ax.text(
        0.01,
        0.95,
        "Validation scores are 5-fold OOF. Public LB is the submitted DACON score.",
        transform=ax.transAxes,
        fontsize=9,
        color="#455a64",
        va="top",
    )
    savefig("performance_comparison.png")


def plot_hit_curve(y_true: np.ndarray, preds: dict[str, np.ndarray]) -> None:
    radii = np.linspace(0.002, 0.05, 120)
    selected = ["Physics", "ExtraTrees", "XGBoost", "Weighted Ensemble"]
    colors = {
        "Physics": "#757575",
        "ExtraTrees": "#5fa8d3",
        "XGBoost": "#0b6e99",
        "Weighted Ensemble": "#58a55c",
    }

    fig, ax = plt.subplots(figsize=(10.5, 5.8))
    for name in selected:
        dist = distance(preds[name], y_true)
        hits = [(dist <= radius).mean() for radius in radii]
        ax.plot(radii * 100, hits, label=name, linewidth=2.4, color=colors[name])

    ax.axvline(1.0, color="#d84315", linestyle="--", linewidth=1.8)
    ax.text(1.05, 0.30, "Official radius: 1 cm", color="#d84315", fontsize=10)
    ax.set_xlabel("Hit radius (cm)")
    ax.set_ylabel("Hit rate")
    ax.set_title("Hit Rate Curve by Radius")
    ax.set_xlim(0.2, 5.0)
    ax.set_ylim(0.15, 1.0)
    ax.grid(alpha=0.25)
    ax.legend(loc="lower right")
    ax.spines[["top", "right"]].set_visible(False)
    savefig("hit_curve.png")


def plot_trajectory_example(
    x_train: np.ndarray,
    y_true: np.ndarray,
    base: np.ndarray,
    xgb_pred: np.ndarray,
) -> None:
    physics_dist = distance(base, y_true)
    xgb_dist = distance(xgb_pred, y_true)
    improved = np.where((physics_dist > 0.012) & (xgb_dist <= 0.010))[0]
    if len(improved) == 0:
        sample_idx = int(np.argmax(physics_dist - xgb_dist))
    else:
        sample_idx = int(improved[np.argmax((physics_dist - xgb_dist)[improved])])

    times = np.arange(-400, 1, 40)
    target_time = 80
    axes = ["x forward", "y left", "z up"]
    colors = ["#0b6e99", "#58a55c", "#b15f00"]

    fig, axs = plt.subplots(3, 1, figsize=(10.5, 7.8), sharex=True)
    for axis, ax in enumerate(axs):
        ax.plot(
            times,
            x_train[sample_idx, :, axis],
            marker="o",
            color=colors[axis],
            linewidth=2,
            label="Observed trajectory",
        )
        ax.scatter(
            [target_time],
            [y_true[sample_idx, axis]],
            s=85,
            marker="*",
            color="#d84315",
            label="True +80ms" if axis == 0 else None,
            zorder=4,
        )
        ax.scatter(
            [target_time],
            [base[sample_idx, axis]],
            s=70,
            marker="x",
            color="#757575",
            label="Physics prediction" if axis == 0 else None,
            zorder=4,
        )
        ax.scatter(
            [target_time],
            [xgb_pred[sample_idx, axis]],
            s=70,
            marker="D",
            color="#0b6e99",
            label="XGBoost corrected" if axis == 0 else None,
            zorder=4,
        )
        ax.set_ylabel(f"{axes[axis]} (m)")
        ax.grid(alpha=0.25)
        ax.spines[["top", "right"]].set_visible(False)

    axs[0].set_title(
        "Example Trajectory: Residual Model Corrects the +80ms Target"
    )
    axs[-1].set_xlabel("Time from last observation (ms)")
    axs[0].legend(loc="best")
    fig.text(
        0.13,
        0.02,
        f"sample index={sample_idx}, physics error={physics_dist[sample_idx]*100:.2f} cm, "
        f"xgboost error={xgb_dist[sample_idx]*100:.2f} cm",
        fontsize=10,
        color="#455a64",
    )
    savefig("trajectory_example.png")


def plot_pipeline() -> None:
    fig, ax = plt.subplots(figsize=(12, 4.8))
    ax.set_axis_off()

    boxes = [
        ("11 observed points\n(-400ms to 0ms)", 0.04, 0.55, "#e3f2fd"),
        ("Physics extrapolation\nvelocity + acceleration", 0.28, 0.55, "#e8f5e9"),
        ("Tabular features\nrelative coords, diffs,\nwindows, poly fits", 0.52, 0.55, "#fff3e0"),
        ("Residual model\nXGBoost", 0.76, 0.55, "#ede7f6"),
        ("Final +80ms point\nbase + 0.425 * residual", 0.52, 0.12, "#fce4ec"),
    ]

    for text, x, y, color in boxes:
        patch = FancyBboxPatch(
            (x, y),
            0.19,
            0.23,
            boxstyle="round,pad=0.02,rounding_size=0.03",
            facecolor=color,
            edgecolor="#37474f",
            linewidth=1.2,
        )
        ax.add_patch(patch)
        ax.text(x + 0.095, y + 0.115, text, ha="center", va="center", fontsize=10)

    arrows = [
        ((0.23, 0.665), (0.28, 0.665)),
        ((0.47, 0.665), (0.52, 0.665)),
        ((0.71, 0.665), (0.76, 0.665)),
        ((0.855, 0.55), (0.66, 0.35)),
        ((0.375, 0.55), (0.56, 0.35)),
    ]
    for start, end in arrows:
        ax.add_patch(
            FancyArrowPatch(
                start,
                end,
                arrowstyle="-|>",
                mutation_scale=16,
                linewidth=1.5,
                color="#37474f",
            )
        )

    ax.text(
        0.5,
        0.92,
        "Prediction Strategy: Model the Motion First, Learn Only the Residual",
        ha="center",
        va="center",
        fontsize=15,
        fontweight="bold",
    )
    ax.text(
        0.5,
        0.04,
        "The final candidate is selected by 5-fold OOF R-Hit@1cm, not by mean distance alone.",
        ha="center",
        va="center",
        fontsize=10,
        color="#455a64",
    )
    savefig("pipeline_overview.png")


def main() -> None:
    report, x_train, y_train, base, preds = load_context()
    plot_performance(report)
    plot_hit_curve(y_train, preds)
    plot_trajectory_example(x_train, y_train, base, preds["XGBoost"])
    plot_pipeline()


if __name__ == "__main__":
    main()
