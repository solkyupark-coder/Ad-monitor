// 리워드·클릭팜(PTC) 유입 차단 목록. GA4(세션 집계)와 Vercel(유입 사이트·일별 방문자)이 같은 목록을 쓴다.
// 도메인(하위 도메인 포함)과 이름 패턴(rupee·2pay·2click·paid4·earn 처럼 PTC 사이트가 자주 쓰는 말)으로 가른다.
// 확장: 아래 기본 목록에 추가하거나, 코드 수정 없이 env로 더한다.
//   REFERRER_BLOCKLIST=a.com,b.net            두 브랜드 공통(도메인)
//   {HOUSCAPER|TOPOGENESIS}_REFERRER_BLOCKLIST=c.org   브랜드별
//   REFERRER_BLOCK_PATTERNS=freecash,gpt4       호스트 이름에 이 글자가 있으면 차단(일반 글자, 정규식 아님)
//   REFERRER_ALLOWLIST=learn.example.com        패턴에 잘못 걸린 정상 도메인을 풀어 준다(차단보다 우선)
// 순수 함수만 둔다(테스트하기 쉽게 외부 import 없음).

export const DEFAULT_BLOCKED_REFERRERS = [
  // 실제로 찍힌 도메인
  "cashlee.co",
  "ad2click.co",
  "rupeetime.co",
  "euro2pay.com",
  "ruppemine.com",
  "paid4ad.com",
  "adsrupee.com",
  // 국내 리워드(앱테크) 앱 — 앱 안 광고·포인트 보상으로 들어온 클릭
  "cashtree.co",
  "cashwalk.com",
  "cashslide.co.kr",
  "adpopcorn.com",
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

// 이름 패턴(정규식 조각 — JS 와 GA4(RE2) 양쪽에서 같은 뜻이어야 해서 lookbehind 같은 건 쓰지 않는다).
// earn 은 learn·yearn 같은 흔한 단어를 피하려고 앞 글자가 l·y 가 아닐 때만 건다.
// 'cash' 는 cashew·cashier·cashback 같은 흔한 말이 많아 통째로 걸지 않고, 알려진 리워드 앱 이름이 붙은 것만 건다(오탐 방지).
export const DEFAULT_BLOCKED_PATTERNS = ["rupee", "2pay", "2click", "paid4", "(^|[^ly])earn", "cash(tree|walk|slide|that|mong|hour|doc|charge)", "adpopcorn"];

export type Blocklist = { domains: string[]; patterns: string[]; allow: string[] };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parsePatterns = (raw: string | undefined | null): string[] => (raw ?? "").split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter((p) => /^[a-z0-9-]{3,30}$/.test(p)).map(escapeRe);

// 기본 목록 + 공통 env + 브랜드 env(예: TOPOGENESIS_REFERRER_BLOCKLIST).
export function blocklistFor(prefix?: string, env: Record<string, string | undefined> = process.env): Blocklist {
  const dom = (raw: string | undefined) => parseDomains(raw);
  return {
    domains: [...new Set([...DEFAULT_BLOCKED_REFERRERS, ...dom(env.REFERRER_BLOCKLIST), ...(prefix ? dom(env[`${prefix}_REFERRER_BLOCKLIST`]) : [])])],
    patterns: [...new Set([...DEFAULT_BLOCKED_PATTERNS, ...parsePatterns(env.REFERRER_BLOCK_PATTERNS)])],
    allow: dom(env.REFERRER_ALLOWLIST),
  };
}

const suffixMatch = (h: string, d: string) => h === d || h.endsWith(`.${d}`);
// 허용 목록이 우선. 그다음 도메인(정확히 같거나 하위 도메인; notcashlee.co 는 걸리지 않음) 또는 이름 패턴.
export function isBlocked(host: string, bl: Blocklist): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h || bl.allow.some((d) => suffixMatch(h, d))) return false;
  return bl.domains.some((d) => suffixMatch(h, d)) || new RegExp(bl.patterns.join("|")).test(h);
}

// GA4 소스/매체("cashlee.co / referral")의 소스 부분.
export const sourceHost = (sourceMedium: string): string => sourceMedium.split("/")[0].trim();
export const isBlockedSource = (sourceMedium: string, bl: Blocklist): boolean => isBlocked(sourceHost(sourceMedium), bl);

// GA4 sessionSource 에 걸 전체 일치 정규식(RE2). 도메인은 하위 도메인까지, 패턴은 어디에 있든.
export const ga4BlockRegex = (bl: Blocklist): string =>
  `(?:(.*\\.)?(${bl.domains.map(escapeRe).join("|")})|.*(?:${bl.patterns.join("|")}).*)`;
const ga4AllowRegex = (bl: Blocklist): string => `(.*\\.)?(${bl.allow.map(escapeRe).join("|")})`;
const srcFilter = (value: string) => ({ filter: { fieldName: "sessionSource", stringFilter: { matchType: "FULL_REGEXP", value, caseSensitive: false } } });
// GA4 dimensionFilter 식: 차단 대상 소스(허용 목록은 제외).
export function ga4BlockedExpression(bl: Blocklist): object {
  const blocked = srcFilter(ga4BlockRegex(bl));
  return bl.allow.length ? { andGroup: { expressions: [blocked, { notExpression: srcFilter(ga4AllowRegex(bl)) }] } } : blocked;
}
