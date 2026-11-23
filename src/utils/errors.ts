/** Maps common Discord API errors to clear Spanish messages without leaking internals. */
export function describeApiError(
  error: unknown,
  fallback = 'No se pudo completar la acción. Inténtalo de nuevo.',
): string {
  const code =
    typeof error === 'object' && error !== null
      ? (error as { code?: number | string }).code
      : undefined;

  switch (code) {
    case 50013:
      return 'No tengo permisos suficientes para realizar esta acción. Revisa mis permisos y mi rol.';
    case 50001:
      return 'No tengo acceso a ese canal. Revisa mis permisos.';
    case 10013:
      return 'No encontré a ese usuario en el servidor.';
    case 10026:
      return 'Ese usuario no está baneado.';
    case 10007:
      return 'No encontré el miembro especificado.';
    case 40001:
      return 'No se pudo encontrar el mensaje. Puede que sea demasiado antiguo.';
    case 50034:
      return 'No puedo sancionar a un miembro con un rol superior o igual al mío.';
    case 429:
      return 'Discord está limitando las solicitudes. Espera un momento e inténtalo de nuevo.';
    default:
      return fallback;
  }
}
