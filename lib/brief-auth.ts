// /api/brief·/api/cron/brief 공통: Authorization: Bearer <키>를 상수 시간으로 비교한다. 키가 비었거나 짧으면 항상 닫힘.
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function bearerMatches(header: string | null, ...keys: (string | undefined)[]): boolean {
  const m = /^Bearer\s+(.+)$/i.exec((header ?? "").trim());
  if (!m) return false;
  const got = digest(m[1].trim());
  return keys.some((k) => !!k && k.length >= 16 && timingSafeEqual(got, digest(k)));
}
