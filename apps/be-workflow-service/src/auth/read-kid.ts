/** Reads the unverified header purely to select a key; the signature is still checked afterwards. */
export function readKid(rawJwt: string): string | undefined {
  const encodedHeader = rawJwt.split('.')[0];
  if (!encodedHeader) {
    return undefined;
  }

  try {
    const header: unknown = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (typeof header === 'object' && header !== null && 'kid' in header) {
      const { kid } = header as { kid?: unknown };
      return typeof kid === 'string' ? kid : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
