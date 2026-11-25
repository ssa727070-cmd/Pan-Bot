export type MinecraftSoftware =
  | 'purpur'
  | 'paper'
  | 'spigot'
  | 'bukkit'
  | 'fabric'
  | 'neoforge'
  | 'forge'
  | 'vanilla'
  | 'unknown';

const SOFTWARE_LABELS: Record<MinecraftSoftware, string> = {
  purpur: 'Purpur',
  paper: 'Paper',
  spigot: 'Spigot',
  bukkit: 'Bukkit',
  fabric: 'Fabric',
  neoforge: 'NeoForge',
  forge: 'Forge',
  vanilla: 'Vanilla',
  unknown: 'Desconocido / no detectado',
};

export function detectSoftware(hint: string): MinecraftSoftware {
  const value = hint.toLowerCase();
  if (value.includes('purpur')) return 'purpur';
  if (value.includes('paper')) return 'paper';
  if (value.includes('spigot')) return 'spigot';
  if (value.includes('bukkit')) return 'bukkit';
  if (value.includes('neoforge')) return 'neoforge';
  if (value.includes('fabric')) return 'fabric';
  if (value.includes('forge')) return 'forge';
  if (value.includes('vanilla')) return 'vanilla';
  return 'unknown';
}

export function softwareLabel(software: MinecraftSoftware): string {
  return SOFTWARE_LABELS[software];
}

export interface PluginCapabilities {
  detected: boolean;
  luckPerms: boolean;
  skript: boolean;
  essentialsX: boolean;
  placeholderApi: boolean;
  vault: boolean;
}

/** Vault is reported only as information: Pan Bot has no economy features. */
export function detectPlugins(pluginListOutput: string): PluginCapabilities {
  const value = pluginListOutput.toLowerCase();
  return {
    detected: value.trim().length > 0,
    luckPerms: value.includes('luckperms'),
    skript: /\bskript\b/.test(value),
    essentialsX: value.includes('essentialsx') || value.includes('essentials'),
    placeholderApi: value.includes('placeholderapi'),
    vault: value.includes('vault'),
  };
}

export const PLUGIN_DEPENDENCIES: Record<string, string> = {
  'whitelist-list': 'Ninguno (comando vanilla)',
  mute: 'EssentialsX o LuckPerms con soporte de mute',
  unmute: 'EssentialsX o LuckPerms con soporte de mute',
  broadcast: 'EssentialsX / plugin de broadcast',
  heal: 'EssentialsX',
  feed: 'EssentialsX',
  plugins: 'Paper, Spigot o Bukkit',
};

export function pluginRequirement(action: string): string | null {
  const requirement = PLUGIN_DEPENDENCIES[action];
  return requirement && requirement !== 'Ninguno (comando vanilla)' ? requirement : null;
}
