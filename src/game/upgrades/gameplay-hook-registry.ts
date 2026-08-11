import { DefinitionRegistry } from "../../content/registry";

export interface GameplayHookImplementation {
  readonly id: string;
  readonly owner: string;
  readonly verification: string;
}

/**
 * Auditable routing table from every player-facing skill hook to its actual
 * gameplay owner and focused verification suite. This is not an execution
 * switch: it prevents a UI-only skill from being declared complete unnoticed.
 */
export const gameplayHookImplementationRegistry = new DefinitionRegistry<GameplayHookImplementation>([
  { id: "basic-corridor-scale", owner: "combat/modifiers.applyDashModifiers", verification: "basic-passives" },
  { id: "basic-corridor-edge-pull", owner: "abilities/path-passives.scheduleGravityPulls", verification: "basic-passives" },
  { id: "basic-quadratic-path", owner: "abilities/dash-slash.executeCurveDashSlash", verification: "basic-passives+browser" },
  { id: "dash-obstacle-refraction", owner: "entities/obstacle-system.planDashPolylineGeometry", verification: "projectile-obstacle-hazard+browser" },
  { id: "refraction-second-leg-scale", owner: "game.completeDash", verification: "basic-passives" },
  { id: "refraction-kill-recovery", owner: "game.killEnemy", verification: "basic-passives" },
  { id: "stored-path-cross-execution", owner: "abilities/path-passives.prepareRegularDashPathEffects", verification: "basic-passives+browser" },
  { id: "cross-projectile-purge", owner: "entities/projectile-system.purgeProjectilesInRadius", verification: "basic-passives+browser" },
  { id: "cross-armor-interrupt", owner: "game.resolveCrossExecution", verification: "basic-passives+browser" },
  { id: "path-echo-once", owner: "abilities/path-passives.schedulePathSlash", verification: "basic-passives" },
  { id: "path-echo-second", owner: "abilities/path-passives.schedulePathSlash", verification: "basic-passives" },
  { id: "basic-endpoint-impact", owner: "game.resolveImpactBurst", verification: "basic-passives" },
  { id: "basic-projectile-reversal", owner: "entities/projectile-system.resolveProjectilesAlongDashSegment", verification: "projectile-obstacle-hazard" },
  { id: "basic-distance-scale", owner: "combat/modifiers.applyDashModifiers", verification: "basic-passives" },
  { id: "basic-recovery-scale", owner: "combat/modifiers.applyDashModifiers", verification: "basic-passives" },
  { id: "charged-aim-steering", owner: "abilities/charged-dash.updateChargedDashTarget", verification: "charged-dash-armor" },
  { id: "charged-threshold-500", owner: "abilities/charged-dash.beginChargedDash", verification: "charged-dash-armor" },
  { id: "charged-overhold-width", owner: "abilities/charged-dash.executeChargedDash", verification: "charged-dash-armor" },
  { id: "charged-armor-break-recovery", owner: "game.breakEnemyArmor", verification: "charged-dash-armor" },
  { id: "charged-chain-breach-width", owner: "game.breakEnemyArmor", verification: "charged-dash-armor" },
  { id: "charged-armor-shrapnel", owner: "game.resolveArmorShrapnel", verification: "charged-dash-armor" },
  { id: "charged-execution-recovery", owner: "game.killEnemy", verification: "charged-dash-armor" },
  { id: "charged-rear-execution-hunt-charge", owner: "game.killEnemy", verification: "charged-dash-armor" },
  { id: "charged-rear-execution-energy", owner: "game.killEnemy", verification: "charged-dash-armor" },
  { id: "ultimate-segment-count-four", owner: "abilities/vector-focus.startVectorFocus", verification: "vector-focus" },
  { id: "ultimate-planning-duration", owner: "abilities/vector-focus.startVectorFocus", verification: "vector-focus" },
  { id: "ultimate-final-vector-echo", owner: "abilities/vector-focus.completeVectorFocusSegment", verification: "vector-focus" },
  { id: "ultimate-internal-cross", owner: "abilities/vector-focus.completeVectorFocusSegment", verification: "vector-focus" },
  { id: "ultimate-projectile-return", owner: "entities/projectile-system.resolveProjectilesAlongDashSegment", verification: "projectile-obstacle-hazard" },
  { id: "ultimate-residual-energy", owner: "abilities/vector-focus.completeVectorFocusSegment", verification: "vector-focus" },
  { id: "dash-kill-momentum", owner: "abilities/path-passives.consumeKillMomentumRecovery", verification: "basic-passives" },
]);
