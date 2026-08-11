export const GAMEPLAY_RANDOM_ALGORITHM = "mulberry32-v1" as const;

export interface SeededRandomState {
  algorithm: typeof GAMEPLAY_RANDOM_ALGORITHM;
  state: number;
  draws: number;
}

export interface SeededRandom {
  next(): number;
  snapshot(): SeededRandomState;
}

export function createSeededRandom(seed: number, restored?: SeededRandomState): SeededRandom {
  let state = (restored?.state ?? seed) >>> 0;
  let draws = restored?.draws ?? 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      draws += 1;
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    },
    snapshot() {
      return { algorithm: GAMEPLAY_RANDOM_ALGORITHM, state, draws };
    },
  };
}
