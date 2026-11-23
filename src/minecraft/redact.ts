import { env } from '../config/env.js';

/** Removes credentials and token-like strings before anything is logged or stored. */
export function redactSecrets(input: unknown): string {
  let value = typeof input === 'string' ? input : String(input ?? '');

  const configuredPassword = env.MINECRAFT_RCON_PASSWORD;
  if (configuredPassword.length > 0) {
    value = value.split(configuredPassword).join('[REDACTED]');
  }

  value = value.replace(
    /\b(password|passwd|pwd|token|secret|api[_-]?key)\s*[:=]?\s+([^\s,;]+)/gi,
    '$1=[REDACTED]',
  );
  value = value.replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{30,}/g, '[REDACTED]');
  // eslint-disable-next-line no-control-regex -- redact control chars from untrusted output.
  value = value.replace(/[\r\n\u0000-\u001F]+/g, ' ');
  return value.trim().slice(0, 500);
}
