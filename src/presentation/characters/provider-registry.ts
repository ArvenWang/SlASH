import type { CharacterProvider } from "./types";

export class CharacterProviderRegistry {
  private readonly providers = new Map<string, CharacterProvider>();

  register(provider: CharacterProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Duplicate character provider id: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): CharacterProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown character provider id: ${id}`);
    return provider;
  }

  list(): readonly CharacterProvider[] {
    return [...this.providers.values()];
  }

  async prepare(ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)];
    // Keep GLB image decoding sequential. Some browser GPU configurations can
    // starve concurrent createImageBitmap work during module bootstrap.
    for (const id of unique) await this.get(id).prepare();
  }

  dispose(): void {
    for (const provider of this.providers.values()) provider.dispose();
    this.providers.clear();
  }
}
