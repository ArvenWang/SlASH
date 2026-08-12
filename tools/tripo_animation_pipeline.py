#!/usr/bin/env python3
"""Retarget Tripo preset animations without persisting API secrets."""

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
from tripo3d.models import Animation

from tripo_pipeline import (
    download_models_resilient,
    enum_value,
    get_balance_resilient,
    wait_for_task_resilient,
    write_manifest,
)


ANIMATIONS = {
    "idle": Animation.IDLE,
    "walk": Animation.WALK,
    "run": Animation.RUN,
    "dive": Animation.DIVE,
    "climb": Animation.CLIMB,
    "jump": Animation.JUMP,
    "slash": Animation.SLASH,
    "shoot": Animation.SHOOT,
    "hurt": Animation.HURT,
    "fall": Animation.FALL,
    "turn": Animation.TURN,
}


async def retarget_character(args: argparse.Namespace) -> int:
    api_key = os.environ.get("TRIPO_API_KEY")
    if not api_key:
        print("TRIPO_API_KEY is required", file=sys.stderr)
        return 2

    animation_names = [name.strip().lower() for name in args.animations.split(",") if name.strip()]
    unknown = [name for name in animation_names if name not in ANIMATIONS]
    if not animation_names or unknown:
        print(f"Invalid animations: {', '.join(unknown) if unknown else 'none'}", file=sys.stderr)
        return 2
    if len(animation_names) > 5:
        print("Tripo v2.5 accepts at most five animations per retarget task", file=sys.stderr)
        return 2

    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.json"
    task_id: Optional[str] = args.resume_task_id
    prior_manifest: Dict[str, Any] = {}
    if manifest_path.is_file():
        try:
            prior_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            prior_manifest = {}

    client = TripoClient(api_key=api_key)
    balance_before = await get_balance_resilient(api_key)
    common_manifest: Dict[str, Any] = {
        "pipeline": "tripo-animation-retarget-v2.5",
        "createdAt": prior_manifest.get("createdAt", datetime.now(timezone.utc).isoformat()),
        "candidate": args.candidate,
        "rigTaskId": args.rig_task_id,
        "animationTaskId": task_id,
        "animations": animation_names,
        "format": "glb",
        "bakeAnimation": True,
        "exportWithGeometry": True,
        "animateInPlace": True,
        "balanceBefore": prior_manifest.get("balanceBefore", balance_before.balance),
    }
    print(f"balance_before={balance_before.balance:.2f}", flush=True)

    try:
        if task_id:
            print(f"resuming_animation_task_id={task_id}", flush=True)
        else:
            task_id = await client.retarget_animation(
                args.rig_task_id,
                animation=[ANIMATIONS[name] for name in animation_names],
                out_format="glb",
                bake_animation=True,
                export_with_geometry=True,
                animate_in_place=True,
            )
            print(f"animation_task_id={task_id}", flush=True)

        task = await wait_for_task_resilient(api_key, task_id, args.timeout)
        status = enum_value(task.status)
        print(f"status={status}", flush=True)
        common_manifest["animationTaskId"] = task_id
        if status.lower() != "success":
            write_manifest(
                manifest_path,
                {
                    **common_manifest,
                    "status": status,
                    "errorCode": task.error_code,
                    "errorMessage": task.error_msg,
                },
            )
            return 1

        downloaded = await download_models_resilient(api_key, task, output_dir)
        balance_after = await get_balance_resilient(api_key)
        clean_downloads = {
            key: Path(value).name if value else None
            for key, value in downloaded.items()
        }
        credits_consumed = round(
            float(common_manifest["balanceBefore"]) - balance_after.balance,
            4,
        )
        write_manifest(
            manifest_path,
            {
                **common_manifest,
                "status": status,
                "balanceAfter": balance_after.balance,
                "creditsConsumed": credits_consumed,
                "downloads": clean_downloads,
            },
        )
        print(f"balance_after={balance_after.balance:.2f}", flush=True)
        print(f"credits_consumed={credits_consumed:.2f}", flush=True)
        for name, filename in clean_downloads.items():
            if filename:
                print(f"downloaded_{name}={filename}", flush=True)
        return 0
    except Exception as exc:
        write_manifest(
            manifest_path,
            {
                **common_manifest,
                "animationTaskId": task_id,
                "status": "pipeline-error",
                "errorType": type(exc).__name__,
                "errorMessage": str(exc),
            },
        )
        print(f"pipeline_error={type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        await client.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--rig-task-id", required=True)
    parser.add_argument("--animations", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--resume-task-id")
    parser.add_argument("--timeout", type=float, default=1200.0)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(retarget_character(parse_args())))
