export const MATERIAL_TOKENS = Object.freeze({
  surface: {
    darkPrimary: 0x070a0c,
    darkSecondary: 0x151b1e,
    playerArmor: 0x29363c,
    enemyArmor: 0x30383c,
  },
  energy: {
    playerCore: 0xd4f5f7,
    playerGlow: 0xbceff2,
    enemyWarning: 0xff5b2e,
    enemyEmissive: 0xff2b0d,
  },
  blood: {
    primary: 0x740009,
    bright: 0xa80016,
    deep: 0x180001,
  },
  environment: {
    coldLight: 0xb8dbe2,
    coolRim: 0x62dfff,
    warmAccent: 0xff5a28,
    background: 0x0b1d28,
    fog: 0x183b49,
  },
} as const);

export type MaterialTokenPath =
  | "surface.darkPrimary"
  | "surface.darkSecondary"
  | "surface.playerArmor"
  | "surface.enemyArmor"
  | "energy.playerCore"
  | "energy.playerGlow"
  | "energy.enemyWarning"
  | "energy.enemyEmissive"
  | "blood.primary"
  | "blood.bright"
  | "blood.deep"
  | "environment.coldLight"
  | "environment.coolRim"
  | "environment.warmAccent"
  | "environment.background"
  | "environment.fog";
