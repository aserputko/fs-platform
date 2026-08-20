import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

/** Identity caps `?ids=` at this many per request, so callers are batched to match. */
export const MAX_IDS_PER_LOOKUP = 100;

interface UserSummary {
  id: string;
  displayName: string | null;
}

interface CacheEntry {
  displayName: string | null;
  expiresAt: number;
}

/**
 * Resolves user ids to display names via be-identity-service. This is a presentation concern, so
 * every failure degrades to null names rather than failing the read that triggered it.
 */
@Injectable()
export class UserDirectoryService {
  private readonly logger = new Logger(UserDirectoryService.name);
  private readonly cache = new Map<string, CacheEntry>();

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly ttlMs: number;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('IDENTITY_BASE_URL', { infer: true }).replace(/\/$/, '');
    this.timeoutMs = config.get('IDENTITY_TIMEOUT_MS', { infer: true });
    this.ttlMs = config.get('USER_CACHE_TTL_SECONDS', { infer: true }) * 1000;
  }

  /**
   * `bearerToken` is the caller's own token, forwarded so identity's existing guard applies.
   * A service principal has none, so its reads legitimately come back with null names.
   */
  async resolve(userIds: string[], bearerToken?: string): Promise<Map<string, string | null>> {
    const unique = [...new Set(userIds)];
    const resolved = new Map<string, string | null>();
    const missing: string[] = [];
    const now = Date.now();

    for (const id of unique) {
      const cached = this.cache.get(id);
      if (cached && cached.expiresAt > now) {
        resolved.set(id, cached.displayName);
      } else {
        missing.push(id);
      }
    }

    if (missing.length === 0 || !bearerToken) {
      for (const id of missing) {
        resolved.set(id, null);
      }
      return resolved;
    }

    for (let offset = 0; offset < missing.length; offset += MAX_IDS_PER_LOOKUP) {
      const batch = missing.slice(offset, offset + MAX_IDS_PER_LOOKUP);
      const fetched = await this.fetchBatch(batch, bearerToken);

      for (const id of batch) {
        const displayName = fetched?.get(id) ?? null;
        resolved.set(id, displayName);

        if (fetched) {
          this.cache.set(id, { displayName, expiresAt: Date.now() + this.ttlMs });
        }
      }
    }

    return resolved;
  }

  private async fetchBatch(
    ids: string[],
    bearerToken: string,
  ): Promise<Map<string, string | null> | null> {
    const url = `${this.baseUrl}/users?ids=${encodeURIComponent(ids.join(','))}`;

    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(
          { statusCode: response.status, count: ids.length },
          'User lookup failed; falling back to null display names',
        );
        return null;
      }

      const body = (await response.json()) as UserSummary[];
      return new Map(body.map((user) => [user.id, user.displayName]));
    } catch (error) {
      this.logger.warn(
        { err: error, count: ids.length },
        'User lookup failed; falling back to null display names',
      );
      return null;
    }
  }
}
