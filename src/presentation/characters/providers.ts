import { CharacterProviderRegistry } from "./provider-registry";
import { createProceduralEnemyProvider, createProceduralHeroProvider } from "./procedural-provider";
import type { CharacterCreateOptions, CharacterProvider } from "./types";

class LazyCharacterProvider implements CharacterProvider {
  readonly source = "gltf" as const;
  private delegate: CharacterProvider | null = null;
  private loading: Promise<CharacterProvider> | null = null;

  constructor(
    readonly id: string,
    private readonly load: () => Promise<CharacterProvider>,
  ) {}

  get ready(): boolean {
    return this.delegate?.ready ?? false;
  }

  async prepare(): Promise<void> {
    if (!this.delegate) {
      this.loading ??= this.load();
      let loaded: CharacterProvider;
      try {
        loaded = await this.loading;
      } catch (error) {
        this.loading = null;
        throw error;
      }
      if (loaded.id !== this.id) throw new Error(`Lazy provider ${this.id} loaded mismatched ${loaded.id}.`);
      this.delegate = loaded;
    }
    await this.delegate.prepare();
  }

  create(options: CharacterCreateOptions) {
    if (!this.delegate) throw new Error(`${this.id} must be prepared before create().`);
    return this.delegate.create(options);
  }

  dispose(): void {
    this.delegate?.dispose();
    this.delegate = null;
    this.loading = null;
  }
}

export function createCharacterProviderRegistry(): CharacterProviderRegistry {
  const registry = new CharacterProviderRegistry();
  registry.register(createProceduralHeroProvider());
  registry.register(createProceduralEnemyProvider());
  registry.register(new LazyCharacterProvider("gltf-tripo-hero-v5", async () => {
    const { createTripoHeroProvider } = await import("./gltf-provider");
    return createTripoHeroProvider();
  }));
  registry.register(new LazyCharacterProvider("gltf-tripo-enemy-v5", async () => {
    const { createTripoEnemyProvider } = await import("./gltf-provider");
    return createTripoEnemyProvider();
  }));
  return registry;
}
