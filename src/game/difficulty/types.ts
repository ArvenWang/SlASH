import type { RunProtocolMode } from "../../content/protocols/definitions";

export interface RunProtocolState {
  mode: RunProtocolMode;
  threatLevel: 0 | 1 | 2 | 3 | 4 | 5;
  assistRebootsRemaining: number;
  leaderboardEligible: boolean;
}
