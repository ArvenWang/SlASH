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


async def wait_for_task_resilient(
    api_key: str,
    task_id: str,
    timeout: float,
) -> Any:
    deadline = asyncio.get_running_loop().time() + timeout
    retry_count = 0
    polling_interval = 3.0

    while True:
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            raise asyncio.TimeoutError(f"Task {task_id} did not complete within {timeout} seconds")

        polling_client = TripoClient(api_key=api_key)
        try:
            task = await polling_client.get_task(task_id)
            retry_count = 0
        except (ConnectionError, OSError) as exc:
            retry_count += 1
            if retry_count > 8:
                raise
            retry_delay = min(2.0 * retry_count, 15.0)
            print(
                f"transient_wait_error={type(exc).__name__}; "
                f"retry={retry_count}; delay={retry_delay:.1f}s",
                flush=True,
            )
            await asyncio.sleep(retry_delay)
            continue
        finally:
            await polling_client.close()

        status = enum_value(task.status).lower()
        if status in {"success", "failed", "cancelled", "banned", "expired"}:
            return task

        running_left_time = getattr(task, "running_left_time", None)
        if running_left_time is not None:
            polling_interval = max(2.0, min(float(running_left_time) * 0.5, 30.0))
        else:
            polling_interval = min(polling_interval * 1.5, 30.0)
        await asyncio.sleep(min(polling_interval, max(0.0, remaining)))


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

    task_id: Optional[str] = args.resume_task_id
    manifest_path = output_dir / "manifest.json"
    prior_manifest: Dict[str, Any] = {}
    if task_id and manifest_path.is_file():
        try:
            prior_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            prior_manifest = {}
    common_manifest: Dict[str, Any] = {
        "pipeline": "tripo-p1-multiview",
        "createdAt": prior_manifest.get("createdAt", datetime.now(timezone.utc).isoformat()),
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
        "balanceBefore": prior_manifest.get("balanceBefore", balance_before.balance),
    }

    try:
        if task_id:
            print(f"resuming_task_id={task_id}", flush=True)
        else:
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
        task = await wait_for_task_resilient(api_key, task_id, args.timeout)
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
            "creditsConsumed": round(
                float(common_manifest["balanceBefore"]) - balance_after.balance,
                4,
            ),
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
    finally:
        await client.close()


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
    parser.add_argument("--resume-task-id")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(generate_multiview(parse_args())))
