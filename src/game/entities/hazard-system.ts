import { hazardDefinitions } from "../../content/entities/definitions";
import { copyVec2, squaredDistance, type Vec2 } from "../../core/math/vec2";
import { shapesIntersect } from "../collision/shapes";
import type { GameState, HazardRuntimePhase, HazardState } from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import { hazardWorldShape } from "./entity-shapes";
import {
  hazardActiveDurationScale,
  telegraphDurationScale,
} from "../difficulty/protocol-system";

export const MAX_ACTIVE_HAZARDS = 8;
const EPSILON = 1e-6;

export interface SpawnHazardInput {
  readonly id: string;
  readonly definitionId: string;
  readonly position: Vec2;
  readonly rotationRadians?: number;
  readonly sourceId?: string;
}

export function spawnHazard(state: GameState, input: SpawnHazardInput): HazardState | null {
  if (state.hazards.some((hazard) => hazard.id === input.id)) return null;
  if (state.hazards.length >= MAX_ACTIVE_HAZARDS) return null;
  const definition = hazardDefinitions.get(input.definitionId);
  const hazard: HazardState = {
    id: input.id,
    definitionId: definition.id,
    position: copyVec2(input.position),
    active: false,
    spawnedAtMs: state.elapsedMs,
    rotationRadians: input.rotationRadians ?? 0,
    phase: "telegraph",
    phaseStartedAtMs: state.elapsedMs,
    triggeredAtMs: null,
    sourceId: input.sourceId ?? "environment",
    ageMs: 0,
    phaseElapsedMs: 0,
  };
  state.hazards.push(hazard);
  emitGameEvent(state, {
    type: "hazard-spawned",
    hazardId: hazard.id,
    definitionId: hazard.definitionId,
    position: copyVec2(hazard.position),
  });
  return hazard;
}

/** Advances world-time hazard lifecycles and returns the first lethal source. */
export function advanceHazards(state: GameState, deltaMs: number): string | null {
  let lethalSource: string | null = null;
  const survivors: HazardState[] = [];
  for (const hazard of state.hazards) {
    const definition = hazardDefinitions.get(hazard.definitionId);
    const safeDelta = Math.max(0, deltaMs);
    hazard.ageMs += safeDelta;
    hazard.phaseElapsedMs += safeDelta;

    if (definition.lifecycle === "triggered-mine") {
      if (
        hazard.phase === "telegraph" &&
        hazard.phaseElapsedMs + EPSILON >= definition.telegraphMs * telegraphDurationScale(state)
      ) {
        setPhase(state, hazard, "armed");
      }
      if (hazard.phase === "armed" && playerInsideTrigger(state, hazard, definition.triggerRadius)) {
        hazard.triggeredAtMs = state.elapsedMs;
        setPhase(state, hazard, "triggered");
        emitGameEvent(state, {
          type: "hazard-triggered",
          hazardId: hazard.id,
          position: copyVec2(hazard.position),
          activatesAtMs: state.elapsedMs + definition.triggerDelayMs * telegraphDurationScale(state),
        });
      }
      if (
        hazard.phase === "triggered" &&
        hazard.phaseElapsedMs + EPSILON >= definition.triggerDelayMs * telegraphDurationScale(state)
      ) {
        setPhase(state, hazard, "active");
      }
    } else if (
      hazard.phase === "telegraph" &&
      hazard.phaseElapsedMs + EPSILON >= definition.telegraphMs * telegraphDurationScale(state)
    ) {
      setPhase(state, hazard, "active");
    }

    if (hazard.phase === "active") {
      hazard.active = true;
      if (
        state.player.dash === null &&
        state.player.hp === 1 &&
        shapesIntersect(
          { kind: "circle", center: state.player.position, radius: state.player.radius },
          hazardWorldShape(hazard),
        )
      ) lethalSource ??= hazard.id;
      if (
        hazard.phaseElapsedMs + EPSILON >= definition.activeMs * hazardActiveDurationScale(state)
      ) setPhase(state, hazard, "expired");
    }

    if (hazard.phase !== "expired") survivors.push(hazard);
  }
  state.hazards = survivors;
  return lethalSource;
}

function playerInsideTrigger(state: GameState, hazard: HazardState, triggerRadius: number): boolean {
  const combined = Math.max(0, triggerRadius) + state.player.radius;
  return squaredDistance(state.player.position, hazard.position) <= combined * combined + EPSILON;
}

function setPhase(state: GameState, hazard: HazardState, phase: HazardRuntimePhase): void {
  if (hazard.phase === phase) return;
  hazard.phase = phase;
  hazard.phaseStartedAtMs = state.elapsedMs;
  hazard.phaseElapsedMs = 0;
  hazard.active = phase === "active";
  emitGameEvent(state, {
    type: "hazard-phase-changed",
    hazardId: hazard.id,
    phase,
    position: copyVec2(hazard.position),
  });
}
