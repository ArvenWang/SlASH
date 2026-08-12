#!/usr/bin/env python3
"""Measure platform/background hierarchy in fixed 1600x900 gameplay evidence."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "validation/visual-redesign/environment"
ARENA_POLYGON = np.array([[80, 430], [560, 160], [1515, 415], [1100, 850]], dtype=np.int32)


def metrics(path: Path) -> tuple[dict[str, float], np.ndarray]:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(path)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    arena_mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.fillPoly(arena_mask, [ARENA_POLYGON], 255)
    background_mask = np.zeros_like(arena_mask)
    background_mask[55:160, 140:1480] = 255
    arena = gray[arena_mask > 0]
    background = gray[background_mask > 0]
    edges = cv2.Canny(gray, 35, 80)
    result = {
        "arenaMeanLuminance": float(arena.mean()),
        "arenaMedianLuminance": float(np.median(arena)),
        "arenaP90Luminance": float(np.percentile(arena, 90)),
        "backgroundMeanLuminance": float(background.mean()),
        "backgroundMedianLuminance": float(np.median(background)),
        "backgroundP90Luminance": float(np.percentile(background, 90)),
        "arenaToBackgroundMeanRatio": float(arena.mean() / max(1, background.mean())),
        "arenaEdgeDensity": float(np.mean(edges[arena_mask > 0] > 0)),
    }
    return result, gray


def main() -> int:
    before, _ = metrics(EVIDENCE / "current/post-dash.png")
    final, final_gray = metrics(EVIDENCE / "final/post-dash.png")
    checks = {
        "arenaLuminanceImprovedAtLeast5Percent": final["arenaMeanLuminance"] >= before["arenaMeanLuminance"] * 1.05,
        "platformEdgeDensityImprovedAtLeast5Percent": final["arenaEdgeDensity"] >= before["arenaEdgeDensity"] * 1.05,
        "backgroundBrightnessNotRaisedMoreThan3Percent": final["backgroundMeanLuminance"] <= before["backgroundMeanLuminance"] * 1.03,
        "arenaMeanAtLeast1_75xBackground": final["arenaToBackgroundMeanRatio"] >= 1.75,
    }
    status = "passed" if all(checks.values()) else "failed"
    cv2.imwrite(str(EVIDENCE / "final/grayscale-post-dash.png"), final_gray)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "viewport": [1600, 900],
        "arenaPolygon": ARENA_POLYGON.tolist(),
        "backgroundSample": {"x": [140, 1480], "y": [55, 160]},
        "checks": checks,
        "before": before,
        "final": final,
    }
    (EVIDENCE / "environment-hierarchy-report.json").write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"status": status, "checks": checks, "report": str(EVIDENCE / "environment-hierarchy-report.json")}, indent=2))
    return 0 if status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
