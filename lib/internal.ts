// 운영자(본인) 접속 제외. GA4 도시 기준으로 요청 단계에서 뺀다 — 브라우저 쿠키·로그인은 이 대시보드(읽기 전용)가 볼 수 없다.
// env: INTERNAL_EXCLUDE_CITIES=Gwacheon-si,Seoul   두 브랜드 공통 (GA4 city 값 그대로, 대소문자 무시)
//      {HOUSCAPER|TOPOGENESIS}_INTERNAL_EXCLUDE_CITIES=...   그 브랜드만(공통 값에 더해진다)
// 순수 함수만 둔다(테스트하기 쉽게 외부 import 없음).

const MAX_CITIES = 30;

export function parseCities(raw: string | undefined | null): string[] {
  const out = new Map<string, string>();
  for (const part of (raw ?? "").split(/[,;\n]+/)) {
    const c = part.trim().replace(/\s+/g, " ");
    if (c.length >= 2 && c.length <= 60 && !out.has(c.toLowerCase())) out.set(c.toLowerCase(), c);
  }
  return [...out.values()].slice(0, MAX_CITIES);
}

export function internalCitiesFor(prefix?: string, env: Record<string, string | undefined> = process.env): string[] {
  return parseCities([env.INTERNAL_EXCLUDE_CITIES, prefix ? env[`${prefix}_INTERNAL_EXCLUDE_CITIES`] : undefined].filter(Boolean).join(","));
}

const cityIn = (cities: string[]) => ({ filter: { fieldName: "city", inListFilter: { values: cities } } });

// GA4 dimensionFilter 식: 그 도시들에서 온 접속 / 그 도시들이 아닌 접속.
export const ga4InternalExpression = (cities: string[]): object => cityIn(cities);
export const ga4NotInternalExpression = (cities: string[]): object => ({ notExpression: cityIn(cities) });
