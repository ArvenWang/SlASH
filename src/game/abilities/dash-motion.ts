import { squaredDistance, type Vec2 } from "../../core/math/vec2";
import type { DashPathSegmentState, GameState } from "../domain/types";
import { planDashGeometry } from "../entities/obstacle-system";
import {
  DASH_SPEED_UNITS_PER_SECOND,
  MAX_DASH_DURATION_MS,
  MIN_DASH_DURATION_MS,
} from "../rules/constants";

export function getDashDurationMs(from: Vec2, to: Vec2): number {
  const distance = Math.sqrt(squaredDistance(from, to));
  const duration = (distance / DASH_SPEED_UNITS_PER_SECOND) * 1000;
  return Math.min(MAX_DASH_DURATION_MS, Math.max(MIN_DASH_DURATION_MS, duration));
}

export function buildDashPathSegments(
  state: GameState,
  from: Vec2,
  to: Vec2,
): DashPathSegmentState[] {
  return buildTimedSegments(planDashGeometry(state, from, to));
}

export function buildTimedSegments(
  segments: readonly Omit<DashPathSegmentState, "durationMs">[],
): DashPathSegmentState[] {
  const distances = segments.map((segment) => Math.hypot(
    segment.to.x - segment.from.x,
    segment.to.z - segment.from.z,
  ));
  const totalDistance = distances.reduce((sum, distance) => sum + distance, 0);
  const totalDuration = Math.min(
    MAX_DASH_DURATION_MS,
    Math.max(MIN_DASH_DURATION_MS, totalDistance / DASH_SPEED_UNITS_PER_SECOND * 1000),
  );
  return segments.map((segment, index) => ({
    ...segment,
    durationMs: totalDistance <= 1e-8
      ? totalDuration / Math.max(1, segments.length)
      : totalDuration * (distances[index] ?? 0) / totalDistance,
  }));
}
