#!/usr/bin/env python3
"""Register V5R reference/model silhouettes and report contour deviation."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "validation/visual-redesign/model"
VIEWS = ("front", "left", "back", "right")
REFERENCES = {
    "hero": ROOT / "art/characters/tripo-inputs/hero-v5r-r2",
    "enemy": ROOT / "art/characters/tripo-inputs/enemy-v5r",
}
REGISTERED_HEIGHT = 800
CANVAS_SIZE = (1100, 1000)
AVERAGE_LIMIT = 0.03
LOCAL_P95_LIMIT = 0.05


def read_rgba(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise FileNotFoundError(path)
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2RGBA)
    if image.shape[2] == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2RGBA)
    return cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA)


def largest_component(mask: np.ndarray) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if count <= 1:
        raise ValueError("No silhouette component found")
    component = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    result = labels == component
    kernel = np.ones((3, 3), np.uint8)
    return cv2.morphologyEx(result.astype(np.uint8), cv2.MORPH_CLOSE, kernel).astype(bool)


def reference_mask(path: Path) -> np.ndarray:
    rgba = read_rgba(path)
    rgb = rgba[:, :, :3]
    luminance = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    saturation = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)[:, :, 1]
    # The authored sheets use a pale neutral background; dark graphite and the
    # enemy's saturated red panels both belong to the character silhouette.
    mask = (luminance < 150) | ((saturation > 70) & (luminance < 225))
    return largest_component(mask)


def model_mask(path: Path) -> np.ndarray:
    rgba = read_rgba(path)
    alpha = rgba[:, :, 3]
    if int(alpha.min()) < 240:
        mask = alpha > 32
    else:
        mask = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2GRAY) < 128
    return largest_component(mask)


def register(mask: np.ndarray) -> np.ndarray:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise ValueError("Empty silhouette")
    left, right = int(xs.min()), int(xs.max())
    top, bottom = int(ys.min()), int(ys.max())
    crop = mask[top : bottom + 1, left : right + 1].astype(np.uint8)
    scale = REGISTERED_HEIGHT / max(1, crop.shape[0])
    width = max(1, int(round(crop.shape[1] * scale)))
    resized = cv2.resize(crop, (width, REGISTERED_HEIGHT), interpolation=cv2.INTER_NEAREST).astype(bool)
    canvas = np.zeros((CANVAS_SIZE[1], CANVAS_SIZE[0]), dtype=bool)
    body_midpoints: list[float] = []
    for row in range(int(REGISTERED_HEIGHT * 0.36), int(REGISTERED_HEIGHT * 0.49)):
        columns = np.flatnonzero(resized[row])
        if len(columns) == 0:
            continue
        runs = np.split(columns, np.where(np.diff(columns) > 1)[0] + 1)
        torso_run = max(runs, key=len)
        body_midpoints.append(float(torso_run[0] + torso_run[-1]) * 0.5)
    body_center = float(np.median(body_midpoints)) if body_midpoints else width * 0.5
    x = int(round(CANVAS_SIZE[0] * 0.5 - body_center))
    y = (CANVAS_SIZE[1] - REGISTERED_HEIGHT) // 2
    if x < 0 or x + width > CANVAS_SIZE[0]:
        raise ValueError(f"Registered silhouette is too wide: {width}px")
    canvas[y : y + REGISTERED_HEIGHT, x : x + width] = resized
    return canvas


def contour(mask: np.ndarray) -> np.ndarray:
    eroded = cv2.erode(mask.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1).astype(bool)
    return mask & ~eroded


def contour_metrics(reference: np.ndarray, model: np.ndarray) -> tuple[float, float, float]:
    reference_edge = contour(reference)
    model_edge = contour(model)
    distance_to_reference = cv2.distanceTransform((~reference_edge).astype(np.uint8), cv2.DIST_L2, 5)
    distance_to_model = cv2.distanceTransform((~model_edge).astype(np.uint8), cv2.DIST_L2, 5)
    distances = np.concatenate((distance_to_reference[model_edge], distance_to_model[reference_edge]))
    normalized = distances / REGISTERED_HEIGHT
    return float(normalized.mean()), float(np.percentile(normalized, 95)), float(normalized.max())


def font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            pass
    return ImageFont.load_default()


def overlay_tile(
    reference: np.ndarray,
    model: np.ndarray,
    label: str,
    average: float,
    local_p95: float,
    raw_maximum: float,
) -> Image.Image:
    rgba = np.zeros((CANVAS_SIZE[1], CANVAS_SIZE[0], 4), dtype=np.uint8)
    rgba[:, :, :] = (20, 25, 28, 255)
    overlap = reference & model
    rgba[reference & ~model] = (48, 218, 255, 255)
    rgba[model & ~reference] = (255, 73, 145, 255)
    rgba[overlap] = (238, 243, 241, 255)
    image = Image.fromarray(rgba, "RGBA").resize((440, 400), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 440, 48), fill=(10, 14, 17, 235))
    draw.text(
        (14, 8),
        f"{label.upper()}  avg {average * 100:.2f}%  p95 {local_p95 * 100:.2f}%  raw {raw_maximum * 100:.2f}%",
        font=font(18),
        fill=(244, 247, 246, 255),
    )
    return image


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "registration": "top-bottom-height and bounding-box center",
        "metric": "symmetric contour distance divided by registered body height; local gate uses P95 and preserves raw Hausdorff maximum as diagnostics",
        "thresholds": {"averageHeightRatio": AVERAGE_LIMIT, "localP95HeightRatio": LOCAL_P95_LIMIT},
        "actors": {},
    }
    overall_passed = True
    for actor, reference_root in REFERENCES.items():
        tiles: list[Image.Image] = []
        view_results: dict[str, object] = {}
        for view in VIEWS:
            reference = register(reference_mask(reference_root / f"{view}.png"))
            model = register(model_mask(OUTPUT / "overlay-raw" / f"{actor}-{view}.png"))
            average, local_p95, raw_maximum = contour_metrics(reference, model)
            passed = average <= AVERAGE_LIMIT + 1e-6 and local_p95 <= LOCAL_P95_LIMIT + 1e-6
            overall_passed = overall_passed and passed
            view_results[view] = {
                "averageHeightRatio": average,
                "localP95HeightRatio": local_p95,
                "rawMaximumHeightRatio": raw_maximum,
                "status": "passed" if passed else "failed",
            }
            tiles.append(overlay_tile(reference, model, view, average, local_p95, raw_maximum))
        sheet = Image.new("RGBA", (440 * len(tiles), 400), (15, 20, 23, 255))
        for index, tile in enumerate(tiles):
            sheet.alpha_composite(tile, (index * 440, 0))
        sheet.save(OUTPUT / f"{actor}-orthographic-overlay.png")
        report["actors"][actor] = {"views": view_results}
    report["status"] = "passed" if overall_passed else "failed"
    (OUTPUT / "orthographic-overlay-report.json").write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"status": report["status"], "report": str(OUTPUT / "orthographic-overlay-report.json")}, indent=2))
    return 0 if overall_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
