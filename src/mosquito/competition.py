from __future__ import annotations

import argparse
import json
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from joblib import dump
from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_squared_error
from sklearn.model_selection import KFold
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from tqdm import tqdm

RADIUS = 0.01
DEFAULT_PHYSICS = (1.9890, 0.5225)


@dataclass(frozen=True)
class Dataset:
    train_ids: list[str]
    test_ids: list[str]
    x_train: np.ndarray
    y_train: np.ndarray
    x_test: np.ndarray
    sample_submission: pd.DataFrame


def ensure_data(data_dir: Path, zip_path: Path) -> None:
    if (data_dir / "train").is_dir() and (data_dir / "test").is_dir():
        return
    if not zip_path.exists():
        raise FileNotFoundError(f"Cannot find data zip: {zip_path}")
    data_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(data_dir)


def read_sequence(path: Path) -> np.ndarray:
    df = pd.read_csv(path).sort_values("timestep_ms")
    return df[["x", "y", "z"]].to_numpy(np.float64)


def load_dataset(data_dir: Path) -> Dataset:
    labels = pd.read_csv(data_dir / "train_labels.csv")
    sample = pd.read_csv(data_dir / "sample_submission.csv")

    train_ids = labels["id"].tolist()
    test_ids = sample["id"].tolist()
    y_train = labels[["x", "y", "z"]].to_numpy(np.float64)
    cache_path = data_dir / "_arrays_v1.npz"

    if cache_path.exists():
        cached = np.load(cache_path, allow_pickle=False)
        x_train = cached["x_train"]
        x_test = cached["x_test"]
    else:
        x_train = np.stack(
            [read_sequence(data_dir / "train" / f"{sample_id}.csv") for sample_id in tqdm(train_ids, desc="train")]
        )
        x_test = np.stack(
            [read_sequence(data_dir / "test" / f"{sample_id}.csv") for sample_id in tqdm(test_ids, desc="test")]
        )
        np.savez(cache_path, x_train=x_train, x_test=x_test)

    return Dataset(train_ids, test_ids, x_train, y_train, x_test, sample)


def r_hit(pred: np.ndarray, true: np.ndarray, radius: float = RADIUS) -> float:
    return float(np.mean(np.linalg.norm(pred - true, axis=1) <= radius))


def distance_stats(pred: np.ndarray, true: np.ndarray) -> dict[str, float]:
    dist = np.linalg.norm(pred - true, axis=1)
    return {
        "r_hit_1cm": r_hit(pred, true),
        "mean_dist": float(dist.mean()),
        "rmse_coord": float(np.sqrt(mean_squared_error(true, pred))),
        "q50_dist": float(np.quantile(dist, 0.50)),
        "q90_dist": float(np.quantile(dist, 0.90)),
        "q95_dist": float(np.quantile(dist, 0.95)),
        "q99_dist": float(np.quantile(dist, 0.99)),
    }


def physics_predict(x: np.ndarray, speed_scale: float, accel_scale: float) -> np.ndarray:
    last = x[:, -1]
    velocity = x[:, -1] - x[:, -2]
    acceleration = x[:, -1] - 2.0 * x[:, -2] + x[:, -3]
    return last + speed_scale * velocity + accel_scale * acceleration


def tune_physics(
    x: np.ndarray,
    y: np.ndarray,
    metric: str = "hit",
    speed_grid: np.ndarray | None = None,
    accel_grid: np.ndarray | None = None,
) -> tuple[float, float, dict[str, float]]:
    speed_grid = np.linspace(1.90, 2.05, 151) if speed_grid is None else speed_grid
    accel_grid = np.linspace(0.05, 0.80, 301) if accel_grid is None else accel_grid
    last = x[:, -1]
    velocity = x[:, -1] - x[:, -2]
    acceleration = x[:, -1] - 2.0 * x[:, -2] + x[:, -3]
    residual_base = last - y

    best_key: tuple[float, float] | None = None
    best_params = DEFAULT_PHYSICS
    best_stats: dict[str, float] = {}

    for speed_scale in speed_grid:
        base = residual_base + speed_scale * velocity
        errors = base[None, :, :] + accel_grid[:, None, None] * acceleration[None, :, :]
        dist = np.sqrt(np.sum(errors * errors, axis=2))
        hits = np.mean(dist <= RADIUS, axis=1)
        means = np.mean(dist, axis=1)

        if metric == "mean":
            order = np.lexsort((-hits, means))
        else:
            order = np.lexsort((means, -hits))
        j = int(order[0])
        key = (float(hits[j]), -float(means[j]))
        if best_key is None or key > best_key:
            best_key = key
            best_params = (float(speed_scale), float(accel_grid[j]))
            pred = last + best_params[0] * velocity + best_params[1] * acceleration
            best_stats = distance_stats(pred, y)
    return best_params[0], best_params[1], best_stats


def poly_predict(x: np.ndarray, window: int, degree: int, horizon_index: float = 12.0) -> np.ndarray:
    idx = np.arange(x.shape[1], dtype=np.float64)[-window:]
    out = np.empty((x.shape[0], 3), dtype=np.float64)
    for axis in range(3):
        coeff = np.polyfit(idx, x[:, -window:, axis].T, degree)
        out[:, axis] = np.polyval(coeff, horizon_index)
    return out


def summarize_window(arr: np.ndarray, windows: tuple[int, ...]) -> list[np.ndarray]:
    parts: list[np.ndarray] = []
    length = arr.shape[1]
    for window in windows:
        w = min(window, length)
        block = arr[:, -w:, :]
        parts.extend(
            [
                block.mean(axis=1),
                block.std(axis=1),
                block.min(axis=1),
                block.max(axis=1),
                block[:, -1] - block[:, 0],
                np.linalg.norm(block, axis=2).mean(axis=1)[:, None],
                np.linalg.norm(block, axis=2).std(axis=1)[:, None],
            ]
        )
    return parts


def make_features(x: np.ndarray) -> np.ndarray:
    n = x.shape[0]
    last = x[:, -1]
    rel = x - last[:, None, :]
    d1 = np.diff(x, axis=1)
    d2 = np.diff(d1, axis=1)
    d3 = np.diff(d2, axis=1)

    parts: list[np.ndarray] = [
        x.reshape(n, -1),
        rel.reshape(n, -1),
        d1.reshape(n, -1),
        d2.reshape(n, -1),
        d3.reshape(n, -1),
        np.linalg.norm(d1, axis=2),
        np.linalg.norm(d2, axis=2),
        np.linalg.norm(d3, axis=2),
        last,
        last * last,
        np.sqrt(np.abs(last) + 1e-12),
    ]

    for arr, windows in [(x, (3, 5, 8, 11)), (rel, (3, 5, 8, 11)), (d1, (1, 2, 3, 5, 10)), (d2, (1, 2, 3, 5, 9)), (d3, (1, 2, 3, 5, 8))]:
        parts.extend(summarize_window(arr, windows))

    physics_params = [(2.0, 0.0), (1.989, 0.5225), (1.965, 0.305), (1.9, 0.2075), (1.98875, 0.5225)]
    for speed_scale, accel_scale in physics_params:
        pred = physics_predict(x, speed_scale, accel_scale)
        parts.extend([pred, pred - last])

    for window in (3, 4, 5, 6, 8, 11):
        max_degree = min(3, window - 1)
        for degree in range(1, max_degree + 1):
            pred = poly_predict(x, window=window, degree=degree)
            parts.extend([pred, pred - last])

    features = np.concatenate(parts, axis=1)
    return np.nan_to_num(features, nan=0.0, posinf=0.0, neginf=0.0)


def make_folds(n: int, folds: int, seed: int) -> list[tuple[np.ndarray, np.ndarray]]:
    kf = KFold(n_splits=folds, shuffle=True, random_state=seed)
    return [(tr, va) for tr, va in kf.split(np.arange(n))]


def log_stats(name: str, pred: np.ndarray, true: np.ndarray) -> dict[str, float]:
    stats = distance_stats(pred, true)
    print(
        f"{name:22s} hit={stats['r_hit_1cm']:.4f} "
        f"mean={stats['mean_dist']:.6f} q90={stats['q90_dist']:.6f} q99={stats['q99_dist']:.6f}"
    )
    return stats


def save_submission(sample: pd.DataFrame, pred: np.ndarray, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    sub = sample.copy()
    sub[["x", "y", "z"]] = pred
    sub.to_csv(output, index=False)
    print(f"saved: {output}")


def load_or_make_features(ds: Dataset, data_dir: Path) -> tuple[np.ndarray, np.ndarray]:
    cache_path = data_dir / "_features_v2.npz"
    if cache_path.exists():
        cached = np.load(cache_path, allow_pickle=False)
        return cached["train_features"], cached["test_features"]

    train_features = make_features(ds.x_train)
    test_features = make_features(ds.x_test)
    np.savez(cache_path, train_features=train_features, test_features=test_features)
    return train_features, test_features


def train_ridge(features: np.ndarray, target: np.ndarray, folds: list[tuple[np.ndarray, np.ndarray]]) -> np.ndarray:
    oof = np.zeros_like(target)
    for fold, (tr, va) in enumerate(folds):
        model = make_pipeline(StandardScaler(), Ridge(alpha=1000.0))
        model.fit(features[tr], target[tr])
        oof[va] = model.predict(features[va])
        print(f"ridge fold {fold} done")
    return oof


def get_oof_cache_path(output_dir: Path, profile: str, name: str, folds: int, seed: int) -> Path:
    return output_dir / "oof" / f"{profile}_{name}_folds{folds}_seed{seed}.npy"


def train_extra_trees(
    features: np.ndarray,
    target: np.ndarray,
    folds: list[tuple[np.ndarray, np.ndarray]],
    profile: str,
    seed: int,
) -> np.ndarray:
    n_estimators = 350 if profile == "quick" else 1600
    oof = np.zeros_like(target)
    for fold, (tr, va) in enumerate(folds):
        model = ExtraTreesRegressor(
            n_estimators=n_estimators,
            max_features=0.85,
            min_samples_leaf=1,
            bootstrap=False,
            random_state=seed + fold,
            n_jobs=-1,
        )
        model.fit(features[tr], target[tr])
        oof[va] = model.predict(features[va])
        print(f"extra_trees fold {fold} done")
    return oof


def train_random_forest(
    features: np.ndarray,
    target: np.ndarray,
    folds: list[tuple[np.ndarray, np.ndarray]],
    seed: int,
) -> np.ndarray:
    oof = np.zeros_like(target)
    for fold, (tr, va) in enumerate(folds):
        model = RandomForestRegressor(
            n_estimators=900,
            max_features=0.7,
            min_samples_leaf=1,
            random_state=seed + 100 + fold,
            n_jobs=-1,
        )
        model.fit(features[tr], target[tr])
        oof[va] = model.predict(features[va])
        print(f"random_forest fold {fold} done")
    return oof


def train_lightgbm(
    features: np.ndarray,
    target: np.ndarray,
    folds: list[tuple[np.ndarray, np.ndarray]],
    seed: int,
) -> np.ndarray:
    from lightgbm import LGBMRegressor, early_stopping, log_evaluation

    oof = np.zeros_like(target)
    for fold, (tr, va) in enumerate(folds):
        for axis in range(3):
            params = dict(
                n_estimators=900,
                learning_rate=0.025,
                num_leaves=31,
                max_depth=-1,
                subsample=0.9,
                subsample_freq=1,
                colsample_bytree=0.85,
                min_child_samples=12,
                reg_alpha=0.03,
                reg_lambda=2.0,
                random_state=seed + axis * 19 + fold,
                n_jobs=-1,
                verbosity=-1,
            )
            model = LGBMRegressor(**params)
            model.fit(
                features[tr],
                target[tr, axis],
                eval_set=[(features[va], target[va, axis])],
                callbacks=[early_stopping(80, verbose=False), log_evaluation(0)],
            )
            oof[va, axis] = model.predict(features[va])
        print(f"lightgbm fold {fold} done")
    return oof


def train_xgboost(
    features: np.ndarray,
    target: np.ndarray,
    folds: list[tuple[np.ndarray, np.ndarray]],
    seed: int,
    gpu: bool,
) -> np.ndarray:
    from xgboost import XGBRegressor

    oof = np.zeros_like(target)
    device = "cuda" if gpu else "cpu"
    for fold, (tr, va) in enumerate(folds):
        for axis in range(3):
            model = XGBRegressor(
                n_estimators=900,
                learning_rate=0.025,
                max_depth=4,
                min_child_weight=2.0,
                subsample=0.9,
                colsample_bytree=0.85,
                reg_alpha=0.02,
                reg_lambda=4.0,
                objective="reg:squarederror",
                tree_method="hist",
                device=device,
                random_state=seed + axis * 23 + fold,
                n_jobs=-1,
                verbosity=0,
            )
            model.fit(features[tr], target[tr, axis])
            oof[va, axis] = model.predict(features[va])
        print(f"xgboost fold {fold} done")
    return oof


def train_catboost(
    features: np.ndarray,
    target: np.ndarray,
    folds: list[tuple[np.ndarray, np.ndarray]],
    seed: int,
    gpu: bool,
) -> np.ndarray:
    from catboost import CatBoostRegressor

    oof = np.zeros_like(target)
    for fold, (tr, va) in enumerate(folds):
        task_type = "GPU" if gpu else "CPU"
        model = CatBoostRegressor(
            iterations=1200,
            learning_rate=0.03,
            depth=6,
            l2_leaf_reg=5.0,
            loss_function="MultiRMSE",
            random_seed=seed + fold,
            task_type=task_type,
            boosting_type="Plain",
            devices="0",
            od_type="Iter",
            od_wait=80,
            verbose=False,
        )
        try:
            model.fit(features[tr], target[tr], eval_set=(features[va], target[va]))
        except Exception as exc:
            if not gpu:
                raise
            print(f"catboost GPU failed on fold {fold}; retry CPU: {exc}")
            model.set_params(task_type="CPU", devices=None)
            model.fit(features[tr], target[tr], eval_set=(features[va], target[va]))
        oof[va] = model.predict(features[va])
        print(f"catboost fold {fold} done")
    return oof


def tune_residual_scale(base: np.ndarray, residual: np.ndarray, true: np.ndarray) -> tuple[float, dict[str, float]]:
    best_scale = 0.0
    best_stats = distance_stats(base, true)
    best_key = (best_stats["r_hit_1cm"], -best_stats["mean_dist"])
    for scale in np.linspace(-0.25, 1.25, 301):
        pred = base + scale * residual
        stats = distance_stats(pred, true)
        key = (stats["r_hit_1cm"], -stats["mean_dist"])
        if key > best_key:
            best_key = key
            best_scale = float(scale)
            best_stats = stats
    return best_scale, best_stats


def tune_ensemble(base: np.ndarray, residuals: dict[str, np.ndarray], true: np.ndarray) -> tuple[dict[str, float], dict[str, float]]:
    names = list(residuals)
    rng = np.random.default_rng(2026)
    best_weights = {name: 0.0 for name in names}
    best_stats = distance_stats(base, true)
    best_key = (best_stats["r_hit_1cm"], -best_stats["mean_dist"])

    candidates: list[np.ndarray] = []
    candidates.append(np.zeros(len(names)))
    candidates.extend(np.eye(len(names)))
    for _ in range(4000):
        raw = rng.random(len(names))
        raw = raw / raw.sum()
        scale = rng.uniform(-0.15, 1.15)
        candidates.append(raw * scale)

    for weights in candidates:
        residual = np.zeros_like(base)
        for weight, name in zip(weights, names):
            residual += weight * residuals[name]
        pred = base + residual
        stats = distance_stats(pred, true)
        key = (stats["r_hit_1cm"], -stats["mean_dist"])
        if key > best_key:
            best_key = key
            best_stats = stats
            best_weights = {name: float(weight) for name, weight in zip(names, weights)}
    return best_weights, best_stats


def fit_final_model(name: str, features: np.ndarray, target: np.ndarray, seed: int, gpu: bool, profile: str):
    if name == "ridge":
        model = make_pipeline(StandardScaler(), Ridge(alpha=1000.0))
    elif name == "extra_trees":
        model = ExtraTreesRegressor(
            n_estimators=350 if profile == "quick" else 1600,
            max_features=0.85,
            min_samples_leaf=1,
            bootstrap=False,
            random_state=seed,
            n_jobs=-1,
        )
    elif name == "random_forest":
        model = RandomForestRegressor(
            n_estimators=900,
            max_features=0.7,
            min_samples_leaf=1,
            random_state=seed,
            n_jobs=-1,
        )
    elif name == "lightgbm":
        from lightgbm import LGBMRegressor

        base = LGBMRegressor(
            n_estimators=900,
            learning_rate=0.025,
            num_leaves=31,
            subsample=0.9,
            subsample_freq=1,
            colsample_bytree=0.85,
            min_child_samples=12,
            reg_alpha=0.03,
            reg_lambda=2.0,
            random_state=seed,
            n_jobs=-1,
            verbosity=-1,
        )
        model = MultiOutputRegressor(base, n_jobs=1)
    elif name == "xgboost":
        from xgboost import XGBRegressor

        base = XGBRegressor(
            n_estimators=900,
            learning_rate=0.025,
            max_depth=4,
            min_child_weight=2.0,
            subsample=0.9,
            colsample_bytree=0.85,
            reg_alpha=0.02,
            reg_lambda=4.0,
            objective="reg:squarederror",
            tree_method="hist",
            device="cuda" if gpu else "cpu",
            random_state=seed,
            n_jobs=-1,
            verbosity=0,
        )
        model = MultiOutputRegressor(base, n_jobs=1)
    elif name == "catboost":
        from catboost import CatBoostRegressor

        model = CatBoostRegressor(
            iterations=1200,
            learning_rate=0.03,
            depth=6,
            l2_leaf_reg=5.0,
            loss_function="MultiRMSE",
            random_seed=seed,
            task_type="GPU" if gpu else "CPU",
            boosting_type="Plain",
            devices="0",
            verbose=False,
        )
    else:
        raise ValueError(name)
    try:
        model.fit(features, target)
    except Exception as exc:
        if name != "catboost" or not gpu:
            raise
        print(f"final catboost GPU failed; retry CPU: {exc}")
        model.set_params(task_type="CPU", devices=None)
        model.fit(features, target)
    return model


def run(args: argparse.Namespace) -> None:
    start = time.time()
    ensure_data(args.data_dir, args.zip_path)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.model_dir.mkdir(parents=True, exist_ok=True)

    ds = load_dataset(args.data_dir)
    print(f"x_train={ds.x_train.shape}, y_train={ds.y_train.shape}, x_test={ds.x_test.shape}")

    speed, accel, physics_stats = tune_physics(ds.x_train, ds.y_train, metric="hit")
    print(f"best physics params: speed={speed:.4f}, accel={accel:.4f}, stats={physics_stats}")

    base_train = physics_predict(ds.x_train, speed, accel)
    base_test = physics_predict(ds.x_test, speed, accel)
    all_scores: dict[str, dict[str, float]] = {}
    all_scores["physics"] = log_stats("physics", base_train, ds.y_train)
    save_submission(ds.sample_submission, base_test, args.output_dir / "submission_physics.csv")

    if args.profile == "physics":
        write_report(args.output_dir, all_scores, {"speed": speed, "accel": accel}, start)
        return

    print("building features")
    train_features, test_features = load_or_make_features(ds, args.data_dir)
    print(f"features={train_features.shape}")

    folds = make_folds(len(ds.y_train), args.folds, args.seed)
    residual_target = ds.y_train - base_train
    residual_oof: dict[str, np.ndarray] = {}
    residual_scales: dict[str, float] = {}

    model_plan = ["ridge", "extra_trees"]
    if args.profile == "strong":
        if args.include_random_forest:
            model_plan.append("random_forest")
        if args.include_lightgbm:
            model_plan.append("lightgbm")
        model_plan.extend(["xgboost", "catboost"])

    for name in model_plan:
        print(f"training {name}")
        oof_cache = get_oof_cache_path(args.output_dir, args.profile, name, args.folds, args.seed)
        if oof_cache.exists():
            residual = np.load(oof_cache)
            print(f"loaded cached OOF: {oof_cache}")
        else:
            if name == "ridge":
                residual = train_ridge(train_features, residual_target, folds)
            elif name == "extra_trees":
                residual = train_extra_trees(train_features, residual_target, folds, args.profile, args.seed)
            elif name == "random_forest":
                residual = train_random_forest(train_features, residual_target, folds, args.seed)
            elif name == "lightgbm":
                residual = train_lightgbm(train_features, residual_target, folds, args.seed)
            elif name == "xgboost":
                residual = train_xgboost(train_features, residual_target, folds, args.seed, args.gpu)
            elif name == "catboost":
                residual = train_catboost(train_features, residual_target, folds, args.seed, args.gpu)
            else:
                raise ValueError(name)
            oof_cache.parent.mkdir(parents=True, exist_ok=True)
            np.save(oof_cache, residual)
            print(f"saved OOF: {oof_cache}")

        scale, stats = tune_residual_scale(base_train, residual, ds.y_train)
        residual_oof[name] = residual
        residual_scales[name] = scale
        all_scores[f"{name}_scaled"] = stats
        print(f"{name} best residual scale={scale:.4f}")
        log_stats(f"{name}_scaled", base_train + scale * residual, ds.y_train)

    weights, ensemble_stats = tune_ensemble(base_train, residual_oof, ds.y_train)
    all_scores["oof_ensemble"] = ensemble_stats
    print(f"ensemble weights: {weights}")
    print(f"ensemble stats: {ensemble_stats}")

    best_name, best_stats = max(
        all_scores.items(),
        key=lambda item: (item[1]["r_hit_1cm"], -item[1]["mean_dist"]),
    )
    print(f"best CV candidate: {best_name} -> {best_stats}")

    final_models: dict[str, object] = {}
    if best_name == "physics":
        best_pred = base_test
    elif best_name == "oof_ensemble":
        ensemble_residual_test = np.zeros_like(base_test)
        for name, weight in weights.items():
            if abs(weight) < 1e-12:
                continue
            print(f"fitting final {name}, weight={weight:.6f}")
            model = fit_final_model(name, train_features, residual_target, args.seed, args.gpu, args.profile)
            final_models[f"ensemble_{name}"] = model
            ensemble_residual_test += weight * model.predict(test_features)
        save_submission(ds.sample_submission, base_test + ensemble_residual_test, args.output_dir / "submission_ensemble.csv")
        best_pred = base_test + ensemble_residual_test
    elif best_name.endswith("_scaled"):
        model_name = best_name.removesuffix("_scaled")
        scale = residual_scales[model_name]
        print(f"fitting final best model {model_name}, scale={scale:.6f}")
        model = fit_final_model(model_name, train_features, residual_target, args.seed, args.gpu, args.profile)
        final_models[f"best_{model_name}"] = model
        best_pred = base_test + scale * model.predict(test_features)
    else:
        raise ValueError(best_name)

    save_submission(ds.sample_submission, best_pred, args.output_dir / "submission_best.csv")
    dump(final_models, args.model_dir / "final_models.joblib")
    write_report(
        args.output_dir,
        all_scores,
        {
            "speed": speed,
            "accel": accel,
            "weights": weights,
            "residual_scales": residual_scales,
            "best_name": best_name,
        },
        start,
    )


def write_report(output_dir: Path, scores: dict[str, dict[str, float]], params: dict, start: float) -> None:
    report = {
        "elapsed_sec": time.time() - start,
        "scores": scores,
        "params": params,
    }
    path = output_dir / "report.json"
    path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(f"saved: {path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("data/open"))
    parser.add_argument("--zip-path", type=Path, default=Path("/home/hjw/open.zip"))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    parser.add_argument("--model-dir", type=Path, default=Path("models"))
    parser.add_argument("--profile", choices=["physics", "quick", "strong"], default="physics")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--gpu", action="store_true")
    parser.add_argument("--include-random-forest", action="store_true")
    parser.add_argument("--include-lightgbm", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    run(args)
