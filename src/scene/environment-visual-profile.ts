export interface EnvironmentVisualProfile {
  readonly id: string;
  readonly moduleOffsets: {
    readonly transit: readonly [number, number, number];
    readonly city: readonly [number, number, number];
  };
  readonly platform: {
    readonly understructure: number;
    readonly floor: number;
    readonly floorEnvMapIntensity: number;
    readonly trim: number;
    readonly seam: number;
    readonly plate: number;
    readonly inset: number;
    readonly fascia: number;
    readonly edgeAccent: number;
  };
  readonly transit: {
    readonly structure: number;
    readonly structureEmissive: number;
    readonly innerStructure: number;
    readonly track: number;
    readonly guideLight: number;
    readonly guideOpacity: number;
    readonly trafficOpacity: number;
  };
  readonly city: {
    readonly layers: readonly [
      { readonly color: number; readonly emissive: number; readonly emissiveIntensity: number },
      { readonly color: number; readonly emissive: number; readonly emissiveIntensity: number },
      { readonly color: number; readonly emissive: number; readonly emissiveIntensity: number },
    ];
    readonly functionalLightOpacity: number;
    readonly navigationLightOpacity: number;
    readonly windowOpacity: number;
  };
  readonly ambientLighting: {
    readonly hemisphereIntensity: number;
    readonly keyIntensity: number;
    readonly arenaWashIntensity: number;
    readonly transitFillIntensity: number;
    readonly warmEdgeIntensity: number;
  };
}

/**
 * V5R keeps the transit megastructure as atmospheric scale reference while
 * reserving contrast and surface detail for the playable deck.
 */
export const TRANSIT_PLATFORM_V5R_VISUAL_PROFILE = Object.freeze({
  id: "transit-platform-v5r",
  moduleOffsets: {
    transit: [0, 0, -9.5],
    city: [0, 0, -14],
  },
  platform: {
    understructure: 0x080d11,
    floor: 0x849498,
    floorEnvMapIntensity: 0.82,
    trim: 0x172329,
    seam: 0x091014,
    plate: 0x35494f,
    inset: 0x0c1519,
    fascia: 0x132127,
    edgeAccent: 0x6f8d93,
  },
  transit: {
    structure: 0x101c22,
    structureEmissive: 0x02080b,
    innerStructure: 0x15242b,
    track: 0x0b1318,
    guideLight: 0x5f7d83,
    guideOpacity: 0.15,
    trafficOpacity: 0.11,
  },
  city: {
    layers: [
      { color: 0x081319, emissive: 0x010405, emissiveIntensity: 0.08 },
      { color: 0x0d2027, emissive: 0x030b0f, emissiveIntensity: 0.16 },
      { color: 0x10262d, emissive: 0x051116, emissiveIntensity: 0.18 },
    ],
    functionalLightOpacity: 0.15,
    navigationLightOpacity: 0.3,
    windowOpacity: 0.25,
  },
  ambientLighting: {
    hemisphereIntensity: 0.18,
    keyIntensity: 0.82,
    arenaWashIntensity: 28,
    transitFillIntensity: 9,
    warmEdgeIntensity: 4.2,
  },
} as const satisfies EnvironmentVisualProfile);
