#!/usr/bin/env python3
"""Rig a generated Tripo character without persisting API secrets."""

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
from tripo_pipeline import (
    download_models_resilient,
    enum_value,
    get_balance_resilient,
    wait_for_task_resilient,
    write_manifest,
)


DEFAULT_RIG_MODEL_VERSION = "v2.5-20260210"


async def rig_character(args: argparse.Namespace) -> int:
    api_key = os.environ.get("TRIPO_API_KEY")
    if not api_key:
        print("TRIPO_API_KEY is required", file=sys.stderr)
        return 2

    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.json"
    rig_task_id: Optional[str] = args.resume_task_id
    rigcheck_task_id: Optional[str] = args.rigcheck_task_id
    prior_manifest: Dict[str, Any] = {}
    if manifest_path.is_file():
        try:
            prior_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            prior_manifest = {}

    client = TripoClient(api_key=api_key)
    balance_before = await get_balance_resilient(api_key)
    common_manifest: Dict[str, Any] = {
        "pipeline": "tripo-rig-v2.5",
        "createdAt": prior_manifest.get("createdAt", datetime.now(timezone.utc).isoformat()),
        "candidate": args.candidate,
        "sourceTaskId": args.source_task_id,
        "rigcheckTaskId": rigcheck_task_id,
        "rigTaskId": rig_task_id,
        "modelVersion": args.model_version,
        "rigType": "biped",
        "spec": args.spec,
        "format": "glb",
        "balanceBefore": prior_manifest.get("balanceBefore", balance_before.balance),
    }
    print(f"balance_before={balance_before.balance:.2f}", flush=True)

    try:
        if rig_task_id:
            print(f"resuming_rig_task_id={rig_task_id}", flush=True)
        else:
            if rigcheck_task_id:
                print(f"resuming_rigcheck_task_id={rigcheck_task_id}", flush=True)
            else:
                rigcheck_task_id = await client.check_riggable(args.source_task_id)
                print(f"rigcheck_task_id={rigcheck_task_id}", flush=True)

            rigcheck_task = await wait_for_task_resilient(api_key, rigcheck_task_id, args.timeout)
            rigcheck_status = enum_value(rigcheck_task.status)
            print(f"rigcheck_status={rigcheck_status}", flush=True)
            print(f"riggable={rigcheck_task.output.riggable}", flush=True)
            common_manifest["rigcheckTaskId"] = rigcheck_task_id
            if rigcheck_status.lower() != "success" or not rigcheck_task.output.riggable:
                write_manifest(
                    manifest_path,
                    {
                        **common_manifest,
                        "status": "not-riggable",
                        "rigcheckStatus": rigcheck_status,
                        "riggable": rigcheck_task.output.riggable,
                        "errorCode": rigcheck_task.error_code,
                        "errorMessage": rigcheck_task.error_msg,
                    },
                )
                return 1

            # The official PyPI SDK can lag behind the current API enum. Use
            # create_task so v2.5 is explicit and cannot silently fall back to
            # the deprecated v2.0 rig model.
            rig_task_id = await client.create_task({
                "type": "animate_rig",
                "original_model_task_id": args.source_task_id,
                "model_version": args.model_version,
                "out_format": "glb",
                "rig_type": "biped",
                "spec": args.spec,
            })
            print(f"rig_task_id={rig_task_id}", flush=True)

        task = await wait_for_task_resilient(api_key, rig_task_id, args.timeout)
        status = enum_value(task.status)
        print(f"status={status}", flush=True)
        common_manifest["rigcheckTaskId"] = rigcheck_task_id
        common_manifest["rigTaskId"] = rig_task_id
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
        manifest = {
            **common_manifest,
            "status": status,
            "balanceAfter": balance_after.balance,
            "creditsConsumed": credits_consumed,
            "downloads": clean_downloads,
        }
        write_manifest(manifest_path, manifest)
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
                "rigcheckTaskId": rigcheck_task_id,
                "rigTaskId": rig_task_id,
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
    parser.add_argument("--source-task-id", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--rigcheck-task-id")
    parser.add_argument("--resume-task-id")
    parser.add_argument(
        "--model-version",
        choices=("v2.5-20260210",),
        default=DEFAULT_RIG_MODEL_VERSION,
    )
    parser.add_argument("--spec", choices=("tripo", "mixamo"), default="mixamo")
    parser.add_argument("--timeout", type=float, default=1200.0)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(rig_character(parse_args())))
