import {
  advanceGame,
  advanceStage,
  createGame,
  createFullGameGame,
  createArmorValidationGame,
  createEntityValidationGame,
  createBasicPassiveValidationGame,
  createCampaignEventValidationGame,
  createCampaignForgeValidationGame,
  createCampaignChallengeValidationGame,
  createCampaignEncounterValidationGame,
  createEnemyAttackValidationGame,
  createUltimateValidationGame,
  createStressGame,
  dispatchGameCommand,
  drainGameEvents,
  restartStage,
} from "../game/game";
import type {
  GameCommand,
  GameCommandDispatchResult,
  GameEvent,
  GameRules,
  GameState,
} from "../game/domain/types";

export interface GameRuntime {
  readonly state: GameState;
  dispatch(command: GameCommand): GameCommandDispatchResult;
  drainEvents(): GameEvent[];
  advance(deltaMs: number, enemyMotionEnabled?: boolean): GameEvent[];
  restartStage(): void;
  advanceStage(): void;
  loadStage(stageIndex: number, rules?: Partial<GameRules>): void;
  loadStressScenario(enemyCount?: number): void;
  loadArmorScenario(): void;
  loadUltimateScenario(): void;
  loadEntityScenario(): void;
  loadBasicPassiveScenario(): void;
  loadCampaignEventScenario(): void;
  loadCampaignForgeScenario(): void;
  loadCampaignChallengeScenario(encounterId?: string): void;
  loadCampaignEncounterScenario(encounterId: string): void;
  loadEnemyAttackScenario(definitionId: string): void;
  loadState(state: GameState): void;
  resetRun(): void;
}

export function createGameRuntime(initialStageIndex = 0): GameRuntime {
  // The object identity is deliberately stable. Presentation systems can retain
  // a reference while stage/load operations replace the serializable contents.
  const state = createGame(initialStageIndex);
  const frozenEnemySpeeds: number[] = [];

  function replaceState(replacement: GameState): void {
    Object.assign(state, replacement);
  }

  return {
    state,
    dispatch(command) {
      return dispatchGameCommand(state, command);
    },
    drainEvents() {
      return drainGameEvents(state);
    },
    advance(deltaMs, enemyMotionEnabled = true) {
      if (enemyMotionEnabled) {
        advanceGame(state, deltaMs);
      } else {
        frozenEnemySpeeds.length = state.enemies.length;
        state.enemies.forEach((enemy, index) => {
          frozenEnemySpeeds[index] = enemy.speed;
          enemy.speed = 0;
        });
        advanceGame(state, deltaMs);
        state.enemies.forEach((enemy, index) => {
          enemy.speed = frozenEnemySpeeds[index] ?? 0;
        });
      }
      return drainGameEvents(state);
    },
    restartStage() {
      restartStage(state);
    },
    advanceStage() {
      advanceStage(state);
    },
    loadStage(stageIndex, rules = {}) {
      replaceState(createGame(stageIndex, rules));
    },
    loadStressScenario(enemyCount = 20) {
      replaceState(createStressGame(enemyCount, state.rules));
    },
    loadArmorScenario() {
      replaceState(createArmorValidationGame(state.rules));
    },
    loadUltimateScenario() {
      replaceState(createUltimateValidationGame(state.rules));
    },
    loadEntityScenario() {
      replaceState(createEntityValidationGame(state.rules));
    },
    loadBasicPassiveScenario() {
      replaceState(createBasicPassiveValidationGame(state.rules));
    },
    loadCampaignEventScenario() {
      replaceState(createCampaignEventValidationGame(state.rules));
    },
    loadCampaignForgeScenario() {
      replaceState(createCampaignForgeValidationGame(state.rules));
    },
    loadCampaignChallengeScenario(encounterId) {
      replaceState(createCampaignChallengeValidationGame(encounterId, state.rules));
    },
    loadCampaignEncounterScenario(encounterId) {
      replaceState(createCampaignEncounterValidationGame(encounterId, state.rules));
    },
    loadEnemyAttackScenario(definitionId) {
      replaceState(createEnemyAttackValidationGame(definitionId, state.rules));
    },
    loadState(nextState) {
      replaceState(structuredClone(nextState));
    },
    resetRun() {
      replaceState(createGame(0));
    },
  };
}

export function createFullGameRuntime(seed?: number): GameRuntime {
  const state = createFullGameGame(seed);
  const frozenEnemySpeeds: number[] = [];

  function replaceState(replacement: GameState): void {
    Object.assign(state, replacement);
  }

  return {
    state,
    dispatch(command) {
      return dispatchGameCommand(state, command);
    },
    drainEvents() {
      return drainGameEvents(state);
    },
    advance(deltaMs, enemyMotionEnabled = true) {
      if (enemyMotionEnabled) {
        advanceGame(state, deltaMs);
      } else {
        frozenEnemySpeeds.length = state.enemies.length;
        state.enemies.forEach((enemy, index) => {
          frozenEnemySpeeds[index] = enemy.speed;
          enemy.speed = 0;
        });
        advanceGame(state, deltaMs);
        state.enemies.forEach((enemy, index) => {
          enemy.speed = frozenEnemySpeeds[index] ?? 0;
        });
      }
      return drainGameEvents(state);
    },
    restartStage() {
      restartStage(state);
    },
    advanceStage() {
      advanceStage(state);
    },
    loadStage(stageIndex, rules = {}) {
      replaceState(createGame(stageIndex, rules));
    },
    loadStressScenario(enemyCount = 20) {
      replaceState(createStressGame(enemyCount, state.rules));
    },
    loadArmorScenario() {
      replaceState(createArmorValidationGame(state.rules));
    },
    loadUltimateScenario() {
      replaceState(createUltimateValidationGame(state.rules));
    },
    loadEntityScenario() {
      replaceState(createEntityValidationGame(state.rules));
    },
    loadBasicPassiveScenario() {
      replaceState(createBasicPassiveValidationGame(state.rules));
    },
    loadCampaignEventScenario() {
      replaceState(createCampaignEventValidationGame(state.rules));
    },
    loadCampaignForgeScenario() {
      replaceState(createCampaignForgeValidationGame(state.rules));
    },
    loadCampaignChallengeScenario(encounterId) {
      replaceState(createCampaignChallengeValidationGame(encounterId, state.rules));
    },
    loadCampaignEncounterScenario(encounterId) {
      replaceState(createCampaignEncounterValidationGame(encounterId, state.rules));
    },
    loadEnemyAttackScenario(definitionId) {
      replaceState(createEnemyAttackValidationGame(definitionId, state.rules));
    },
    loadState(nextState) {
      replaceState(structuredClone(nextState));
    },
    resetRun() {
      replaceState(createFullGameGame(state.run.seed, state.rules));
    },
  };
}
