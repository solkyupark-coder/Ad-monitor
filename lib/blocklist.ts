// 리워드·클릭팜(PTC) 유입 차단 목록. GA4(세션 집계)와 Vercel(유입 사이트·일별 방문자)이 같은 목록을 쓴다.
// 도메인만 적는다(서브도메인 포함 일치). 확장: 아래 기본 목록에 추가하거나, 코드 수정 없이 env로 더한다.
//   REFERRER_BLOCKLIST=a.com,b.net            두 브랜드 공통
//   {HOUSCAPER|TOPOGENESIS}_REFERRER_BLOCKLIST=c.org   브랜드별
// 순수 함수만 둔다(테스트하기 쉽게 외부 import 없음).

export const DEFAULT_BLOCKED_REFERRERS = [
  // 실제로 찍힌 도메인
  "cashlee.co",
  "ad2click.co",
  "rupeetime.co",
  "euro2pay.com",
  "ruppemine.com",
  "paid4ad.com",
  // 대표적인 PTC(클릭하면 돈 주는) 사이트
  "neobux.com",
  "clixsense.com",
  "ysense.com",
  "scarlet-clicks.com",
  "timebucks.com",
  "paidverts.com",
];

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z][a-z0-9-]*$/; // 마지막 칸(TLD)은 글자로 시작 — IP·숫자는 도메인이 아니다

// "https://www.Foo.com/x", "*.foo.com", " foo.com " 같은 입력을 foo.com 으로 맞춘다. 도메인이 아니면 버린다.
export function parseDomains(raw: string | undefined | null): string[] {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(/[\s,;]+/)) {
    const d = part
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/^\*?\./, "")
      .replace(/^www\./, "")
      .replace(/\.$/, "");
    if (DOMAIN.test(d)) out.add(d);
  }
  return [...out];
}

// 기본 목록 + 공통 env + 브랜드 env(예: TOPOGENESIS_REFERRER_BLOCKLIST).
export function blockedReferrers(prefix?: string): string[] {
  return [...new Set([...DEFAULT_BLOCKED_REFERRERS, ...parseDomains(process.env.REFERRER_BLOCKLIST), ...(prefix ? parseDomains(process.env[`${prefix}_REFERRER_BLOCKLIST`]) : [])])];
}

// 정확히 같거나 하위 도메인이면 차단(label 경계: notcashlee.co 는 걸리지 않는다).
export function isBlockedHost(host: string, list: string[]): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  return !!h && list.some((d) => h === d || h.endsWith(`.${d}`));
}

// GA4 소스/매체("cashlee.co / referral")의 소스 부분.
export const sourceHost = (sourceMedium: string): string => sourceMedium.split("/")[0].trim();
export const isBlockedSource = (sourceMedium: string, list: string[]): boolean => isBlockedHost(sourceHost(sourceMedium), list);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// GA4 sessionSource 에 걸 전체 일치 정규식(RE2). 서브도메인 포함.
export const ga4SourceRegex = (list: string[]): string => `(.*\\.)?(${list.map(escapeRe).join("|")})`;
