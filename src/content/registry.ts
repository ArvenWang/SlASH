export interface DefinitionWithId {
  readonly id: string;
}

export class DefinitionRegistry<TDefinition extends DefinitionWithId> {
  private readonly definitions = new Map<string, TDefinition>();

  constructor(initialDefinitions: readonly TDefinition[] = []) {
    for (const definition of initialDefinitions) this.register(definition);
  }

  register(definition: TDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Duplicate definition id: ${definition.id}`);
    }
    this.definitions.set(definition.id, definition);
  }

  get(id: string): TDefinition {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown definition id: ${id}`);
    return definition;
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  list(): readonly TDefinition[] {
    return [...this.definitions.values()];
  }
}
