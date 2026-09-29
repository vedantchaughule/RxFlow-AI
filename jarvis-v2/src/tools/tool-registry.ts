import { toolCatalog } from './tool-catalog.js';
import type { ToolDefinition } from './tool-interface.js';

export class ToolRegistry {
  private static instance: ToolRegistry;
  private readonly tools: Map<string, ToolDefinition> = new Map();

  private constructor() {
    for (const tool of toolCatalog) {
      this.registerTool(tool);
    }
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  public registerTool(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  public listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public clearRegistryForTesting(): void {
    this.tools.clear();
    for (const tool of toolCatalog) {
      this.tools.set(tool.name, tool);
    }
  }
}

export function getToolRegistry(): ToolRegistry {
  return ToolRegistry.getInstance();
}
