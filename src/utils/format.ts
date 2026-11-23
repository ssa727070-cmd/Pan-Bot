/** Truncates text to `maxLength`, appending an ellipsis when needed. */
export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/** Formats an uptime in milliseconds as a compact human-readable string. */
export function formatUptime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds}s`]
    .filter(Boolean)
    .join(' ');
}
