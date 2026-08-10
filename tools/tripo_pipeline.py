#!/usr/bin/env python3
"""Run cost-bounded Tripo character generation without persisting API secrets."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, Optional

from tripo3d import TripoClient


MODEL_VERSION = "P1-20260311"


def enum_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def relative_to_workspace(path: Path, workspace: Path) -> str:
    try:
        return str(path.resolve().relative_to(workspace.resolve()))
    except ValueError:
        return path.name


def write_manifest(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


async def generate_multiview(args: argparse.Namespace) -> int:
    api_key = os.environ.get("TRIPO_API_KEY")
    if not api_key:
        print("TRIPO_API_KEY is required", file=sys.stderr)
        return 2

    workspace = Path(args.workspace).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    front = Path(args.front).resolve()
    left = Path(args.left).resolve()
    back = Path(args.back).resolve()
    for source in (front, left, back):
        if not source.is_file():
            print(f"Missing input image: {source}", file=sys.stderr)
            return 2

    client = TripoClient(api_key=api_key)
    balance_before = await client.get_balance()
    print(f"balance_before={balance_before.balance:.2f}", flush=True)

    task_id: Optional[str] = None
    manifest_path = output_dir / "manifest.json"
    common_manifest: Dict[str, Any] = {
        "pipeline": "tripo-p1-multiview",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "candidate": args.candidate,
        "modelVersion": MODEL_VERSION,
        "faceLimit": args.face_limit,
        "modelSeed": args.seed,
        "textureSeed": args.texture_seed,
        "texture": True,
        "pbr": True,
        "textureQuality": "standard",
        "inputs": {
            "front": relative_to_workspace(front, workspace),
            "left": relative_to_workspace(left, workspace),
            "back": relative_to_workspace(back, workspace),
            "right": None,
        },
        "balanceBefore": balance_before.balance,
    }

    try:
        task_id = await client.multiview_to_model(
            images=[str(front), str(left), str(back), None],
            model_version=MODEL_VERSION,
            face_limit=args.face_limit,
            texture=True,
            pbr=True,
            model_seed=args.seed,
            texture_seed=args.texture_seed,
            texture_quality="standard",
            geometry_quality="standard",
            texture_alignment="original_image",
            auto_size=False,
            orientation="align_image",
            quad=False,
            compress=False,
            generate_parts=False,
            smart_low_poly=False,
            export_uv=True,
        )
        print(f"task_id={task_id}", flush=True)
        task = await client.wait_for_task(
            task_id,
            polling_interval=3.0,
            timeout=args.timeout,
            verbose=False,
        )
        status = enum_value(task.status)
        print(f"status={status}", flush=True)

        if status.lower() != "success":
            manifest = {
                **common_manifest,
                "taskId": task_id,
                "status": status,
                "errorCode": task.error_code,
                "errorMessage": task.error_msg,
            }
            write_manifest(manifest_path, manifest)
            return 1

        downloaded = await client.download_task_models(task, str(output_dir))
        balance_after = await client.get_balance()
        clean_downloads = {
            key: Path(value).name if value else None
            for key, value in downloaded.items()
        }
        manifest = {
            **common_manifest,
            "taskId": task_id,
            "status": status,
            "balanceAfter": balance_after.balance,
            "creditsConsumed": round(balance_before.balance - balance_after.balance, 4),
            "downloads": clean_downloads,
        }
        write_manifest(manifest_path, manifest)
        print(f"balance_after={balance_after.balance:.2f}", flush=True)
        print(f"credits_consumed={manifest['creditsConsumed']:.2f}", flush=True)
        for name, filename in clean_downloads.items():
            if filename:
                print(f"downloaded_{name}={filename}", flush=True)
        return 0
    except Exception as exc:
        failure = {
            **common_manifest,
            "taskId": task_id,
            "status": "pipeline-error",
            "errorType": type(exc).__name__,
            "errorMessage": str(exc),
        }
        write_manifest(manifest_path, failure)
        print(f"pipeline_error={type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--front", required=True)
    parser.add_argument("--left", required=True)
    parser.add_argument("--back", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--face-limit", type=int, default=8000)
    parser.add_argument("--seed", type=int, default=314159)
    parser.add_argument("--texture-seed", type=int, default=271828)
    parser.add_argument("--timeout", type=float, default=1200.0)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(generate_multiview(parse_args())))
