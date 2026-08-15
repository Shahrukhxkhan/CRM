/**
 * Keeps ownership decisions explicit and testable without ever trusting a client-provided owner ID.
 */
export function belongsToOwner(recordOwnerId: number, authenticatedOwnerId: number): boolean {
  return recordOwnerId === authenticatedOwnerId;
}
