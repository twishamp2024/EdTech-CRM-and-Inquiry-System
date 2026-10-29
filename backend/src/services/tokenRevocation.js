/**
 * Token ids (`jti`) revoked by logout, kept until the token would have expired
 * anyway. In-memory: correct for a single API instance; tokens revoked before
 * a restart become usable again until their (short) expiry. A shared store
 * (database table or Redis) is needed when running several instances.
 */
export function createTokenRevocationList({ now = () => Date.now() } = {}) {
  const revoked = new Map();

  function prune() {
    const current = now();
    for (const [tokenId, expiresAtMs] of revoked) {
      if (expiresAtMs <= current) revoked.delete(tokenId);
    }
  }

  return {
    revoke(tokenId, expiresAt) {
      prune();
      revoked.set(tokenId, expiresAt.getTime());
    },
    isRevoked(tokenId) {
      const expiresAtMs = revoked.get(tokenId);
      if (expiresAtMs === undefined) return false;
      if (expiresAtMs <= now()) {
        revoked.delete(tokenId);
        return false;
      }
      return true;
    },
    get size() {
      prune();
      return revoked.size;
    },
  };
}
