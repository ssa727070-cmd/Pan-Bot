/**
 * Pure ticket authorisation rules. Everything is evaluated per guild from the
 * guild's own configuration, so there are no global role IDs anywhere.
 *
 * - `Administrator` always has full access (they can see every channel anyway).
 * - Excluded roles can neither open tickets nor use staff privileges, even when the
 *   member also holds a support role. Administrators are never excluded.
 * - Staff = holds a support role. Closers = configured closer roles, or the support
 *   roles when no closer role is configured. The ticket creator may close their own
 *   ticket while `creatorCanClose` is on.
 */
export interface TicketPolicy {
  supportRoleIds: readonly string[];
  excludedRoleIds: readonly string[];
  closerRoleIds: readonly string[];
  creatorCanClose: boolean;
}

export interface TicketActor {
  id: string;
  roleIds: ReadonlySet<string>;
  isAdministrator: boolean;
}

function holdsAny(actor: TicketActor, roles: readonly string[]): boolean {
  return roles.some((roleId) => actor.roleIds.has(roleId));
}

export function isExcluded(actor: TicketActor, policy: TicketPolicy): boolean {
  return !actor.isAdministrator && holdsAny(actor, policy.excludedRoleIds);
}

export function canOpenTicket(actor: TicketActor, policy: TicketPolicy): boolean {
  return !isExcluded(actor, policy);
}

export function isTicketStaff(actor: TicketActor, policy: TicketPolicy): boolean {
  if (actor.isAdministrator) return true;
  if (isExcluded(actor, policy)) return false;
  return holdsAny(actor, policy.supportRoleIds);
}

export function canCloseTicket(
  actor: TicketActor,
  policy: TicketPolicy,
  ticket: { creatorId: string; claimerId: string | null },
): boolean {
  if (actor.isAdministrator) return true;
  if (isExcluded(actor, policy)) return false;
  if (ticket.creatorId === actor.id) return policy.creatorCanClose;
  if (ticket.claimerId === actor.id && isTicketStaff(actor, policy)) return true;
  const closers = policy.closerRoleIds.length > 0 ? policy.closerRoleIds : policy.supportRoleIds;
  return holdsAny(actor, closers);
}

/** Staff may add or remove people; so may the creator, but only while the ticket is theirs. */
export function canManageParticipants(
  actor: TicketActor,
  policy: TicketPolicy,
  ticket: { creatorId: string },
): boolean {
  return (
    isTicketStaff(actor, policy) || (!isExcluded(actor, policy) && ticket.creatorId === actor.id)
  );
}
