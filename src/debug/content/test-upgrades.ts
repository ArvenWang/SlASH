import type { UpgradeDefinition } from "../../content/upgrades/definitions";

export const DEBUG_RECOVERY_UPGRADE: UpgradeDefinition = {
  id: "debug-recovery-80-percent",
  rarity: "debug",
  tags: ["debug", "dash"],
  modifiers: [{ hook: "before-dash", field: "recoveryMs", operation: "multiply", value: 0.8 }],
  presentation: {
    name: "DEBUG / RECOVERY ×0.8",
    description: "Architecture-only modifier fixture. Not production content.",
  },
};

export const DEBUG_HIT_RADIUS_UPGRADE: UpgradeDefinition = {
  id: "debug-hit-radius-110-percent",
  rarity: "debug",
  tags: ["debug", "dash"],
  modifiers: [{ hook: "before-dash", field: "hitRadius", operation: "multiply", value: 1.1 }],
  presentation: {
    name: "DEBUG / HIT RADIUS ×1.1",
    description: "Architecture-only modifier fixture. Not production content.",
  },
};

export const DEBUG_UPGRADES = [DEBUG_RECOVERY_UPGRADE, DEBUG_HIT_RADIUS_UPGRADE] as const;
