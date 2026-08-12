import type { RunProtocolMode } from "../../content/protocols/definitions";

export type ProfileQualityMode = "high" | "compatibility";

export interface ProfileSettings {
  audioEnabled: boolean;
  qualityMode: ProfileQualityMode;
  reducedMotion: boolean;
  highContrast: boolean;
}

export interface ProfileDiscoveries {
  enemyDefinitionIds: string[];
  encounterDefinitionIds: string[];
  bossDefinitionIds: string[];
}

export interface ProfileUnlocks {
  bossPracticeIds: string[];
  maximumThreatLevel: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface ProfileRunJournal {
  readonly serial: number;
  readonly seed: number;
  readonly mode: RunProtocolMode;
  readonly threatLevel: number;
  selectedSkillIds: string[];
  selectedRouteNodeIds: string[];
}

export interface ProfileStatistics {
  runSerial: number;
  runsStarted: number;
  runsDefeated: number;
  runsAbandoned: number;
  playerDeaths: number;
  clears: Record<RunProtocolMode, number>;
  bestClearTimeMs: Record<RunProtocolMode, number | null>;
  highestThreatCleared: number;
  bossVictoriesById: Record<string, number>;
  bossDeathsById: Record<string, number>;
  failureSources: Record<string, number>;
  skillSelectionsById: Record<string, number>;
  routeSelectionsByNodeId: Record<string, number>;
}

export interface PlayerProfile {
  readonly createdAtIso: string;
  updatedAtIso: string;
  discoveries: ProfileDiscoveries;
  unlocks: ProfileUnlocks;
  statistics: ProfileStatistics;
  settings: ProfileSettings;
  activeRun: ProfileRunJournal | null;
}
