import { abilityDefinitions, type AbilitySlot } from "./content/abilities/definitions";
import { enemyDefinitions } from "./content/enemies/definitions";
import { LEVEL_DEFINITIONS } from "./content/levels/definitions";
import { upgradeDefinitions } from "./content/upgrades/definitions";
import { registerDebugTestAbility } from "./debug/content/test-ability";
import { registerDebugTestEnemy } from "./debug/content/test-enemy";
import { DEBUG_UPGRADES } from "./debug/content/test-upgrades";
import { getGameSnapshot, stepGame, type GameEvent } from "./game/game";
import { createGameRuntime } from "./runtime/game-runtime";

declare global {
  interface Window {
    render_content_lab_to_text: () => string;
    content_lab_validation: {
      loadLevel(index: number): void;
      applyEnemy(id: string): void;
      activateAbility(id: string): string;
      applyTestUpgrades(enabled: boolean): void;
      snapshot(): unknown;
    };
  }
}

registerDebugTestAbility();
registerDebugTestEnemy();
for (const upgrade of DEBUG_UPGRADES) {
  if (!upgradeDefinitions.has(upgrade.id)) upgradeDefinitions.register(upgrade);
}

const levelSelect = required<HTMLSelectElement>("#level");
const enemySelect = required<HTMLSelectElement>("#enemy");
const abilitySelect = required<HTMLSelectElement>("#ability");
const upgradeSelect = required<HTMLSelectElement>("#upgrade");
const output = required<HTMLPreElement>("#output");
const runtime = createGameRuntime(0);
let eventLog: GameEvent[] = runtime.drainEvents();

for (const level of LEVEL_DEFINITIONS) addOption(levelSelect, String(level.index), `${level.index + 1} / ${level.name}`);
for (const enemy of enemyDefinitions.list()) addOption(enemySelect, enemy.id, enemy.id);
for (const ability of abilityDefinitions.list()) addOption(abilitySelect, ability.id, `${ability.slot} / ${ability.id}`);

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Content Lab is missing ${selector}.`);
  return element;
}

function addOption(select: HTMLSelectElement, value: string, label: string): void {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function loadLevel(index: number): void {
  const safeIndex = Math.min(LEVEL_DEFINITIONS.length - 1, Math.max(0, Math.round(index)));
  runtime.loadStage(safeIndex);
  eventLog = runtime.drainEvents();
  levelSelect.value = String(safeIndex);
  refresh();
}

function applyEnemy(id: string): void {
  const definition = enemyDefinitions.get(id);
  for (const enemy of runtime.state.enemies) {
    enemy.definitionId = definition.id;
    enemy.radius = definition.radius;
    enemy.speed = definition.baseMoveSpeed;
  }
  enemySelect.value = id;
  refresh();
}

function applyTestUpgrades(enabled: boolean): void {
  runtime.state.run.selectedUpgrades = enabled
    ? DEBUG_UPGRADES.map((upgrade) => upgrade.id)
    : [];
  upgradeSelect.value = enabled ? "debug" : "none";
  refresh();
}

function activateAbility(id: string): string {
  const definition = abilityDefinitions.get(id);
  const slot = definition.slot as AbilitySlot;
  runtime.state.player.abilities[slot] = {
    abilityId: definition.id,
    cooldownRemainingMs: 0,
    resource: definition.resource
      ? {
          id: definition.resource.id,
          current: definition.resource.maximum,
          maximum: definition.resource.maximum,
        }
      : undefined,
  };
  const { result } = runtime.dispatch({
    type: "activate-ability",
    slot,
    target: { x: 19, z: 0 },
  });
  eventLog.push(...runtime.drainEvents());
  for (let tick = 0; tick < 30 && runtime.state.stage.phase === "playing"; tick += 1) {
    stepGame(runtime.state);
    eventLog.push(...runtime.drainEvents());
  }
  abilitySelect.value = id;
  refresh();
  return result;
}

function snapshot() {
  return {
    game: getGameSnapshot(runtime.state),
    selected: {
      levelId: runtime.state.stage.levelId,
      enemyDefinitionId: runtime.state.enemies[0]?.definitionId ?? null,
      abilityId: abilitySelect.value,
      upgrades: [...runtime.state.run.selectedUpgrades],
    },
    definitions: {
      levels: LEVEL_DEFINITIONS.map((level) => level.id),
      enemies: enemyDefinitions.list().map((enemy) => enemy.id),
      abilities: abilityDefinitions.list().map((ability) => ability.id),
      upgrades: upgradeDefinitions.list().map((upgrade) => upgrade.id),
    },
    events: eventLog,
  };
}

function refresh(): void {
  output.textContent = JSON.stringify(snapshot(), null, 2);
}

required<HTMLButtonElement>("#load").addEventListener("click", () => loadLevel(Number(levelSelect.value)));
required<HTMLButtonElement>("#apply-enemy").addEventListener("click", () => applyEnemy(enemySelect.value));
required<HTMLButtonElement>("#activate").addEventListener("click", () => activateAbility(abilitySelect.value));
required<HTMLButtonElement>("#reset").addEventListener("click", () => loadLevel(0));
upgradeSelect.addEventListener("change", () => applyTestUpgrades(upgradeSelect.value === "debug"));

window.render_content_lab_to_text = () => JSON.stringify(snapshot());
window.content_lab_validation = { loadLevel, applyEnemy, activateAbility, applyTestUpgrades, snapshot };
refresh();
