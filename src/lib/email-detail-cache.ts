import type { EmailDetail } from "./types";

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 150;

const cache = new Map<string, { detail: EmailDetail; expires: number }>();

export function emailDetailCacheKey(
  accountId: string,
  folder: string,
  uid: number
): string {
  return `${accountId}:${folder}:${uid}`;
}

export function getCachedEmailDetail(key: string): EmailDetail | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.detail;
}

export function setCachedEmailDetail(key: string, detail: EmailDetail): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { detail, expires: Date.now() + TTL_MS });
}

export function invalidateEmailDetail(
  accountId: string,
  folder: string,
  uid: number
): void {
  cache.delete(emailDetailCacheKey(accountId, folder, uid));
}
