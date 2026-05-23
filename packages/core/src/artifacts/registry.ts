import type { ArtifactPlugin } from "./types.js";

const plugins = new Map<string, ArtifactPlugin>();

/** Register an artifact type plugin. Last registration for an id wins. */
export const registerArtifactPlugin = (plugin: ArtifactPlugin): void => {
  plugins.set(plugin.descriptor.id, plugin);
};

export const getArtifactPlugin = (id: string): ArtifactPlugin | undefined =>
  plugins.get(id);

export const allArtifactPlugins = (): ArtifactPlugin[] => [...plugins.values()];

/**
 * Resolve the plugins to run. With `types` given, only those (ignoring unknown
 * ids); otherwise every registered plugin.
 */
export const artifactPluginsFor = (types?: string[]): ArtifactPlugin[] => {
  if (!types || types.length === 0) return allArtifactPlugins();
  const out: ArtifactPlugin[] = [];
  for (const t of types) {
    const p = plugins.get(t);
    if (p) out.push(p);
  }
  return out;
};
