// D1: 플랫폼별 직접 연동(Windsor 미사용). 연결 상태는 환경변수 존재 여부로만 판단한다 — 값은 절대 화면/로그에 내지 않는다.
export type BrandId = "houscaper" | "topogenesis";
export type PlatformId = "meta" | "google_ads" | "youtube" | "ga4" | "revenue" | "purchase_db" | "vercel" | "reddit" | "tiktok";

export const BRANDS: { id: BrandId; label: string; prefix: string }[] = [
  { id: "houscaper", label: "하우스케이퍼", prefix: "HOUSCAPER" },
  { id: "topogenesis", label: "토포제네시스", prefix: "TOPOGENESIS" },
];

type PlatformDef = {
  id: PlatformId;
  label: string;
  shared: string[]; // 두 브랜드 공통 자격증명
  perBrand: string[]; // `${PREFIX}_${name}` 형태로 브랜드마다 필요
  extra?: Partial<Record<BrandId, string[]>>; // 브랜드마다 다른 전체 이름 (접두사 규칙을 따르지 않는 값)
  fallback?: Partial<Record<BrandId, string[]>>; // extra 가 없을 때 대신 연결로 인정하는 묶음(이전 방식)
  note: string;
};

export const PLATFORMS: PlatformDef[] = [
  {
    id: "meta",
    label: "메타 (페이스북·인스타 광고)",
    shared: [],
    perBrand: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
    note: "브랜드마다 Meta 앱이 따로라 토큰도 브랜드별. 장기(60일) 토큰 또는 시스템 사용자 토큰 필요(ads_read). 인스타그램 프로모션(부스트)이 Ads Manager 계정이 아닌 다른 광고 계정에 있으면 {브랜드}_META_BUSINESS_ID(자동 탐색, business_management 필요) 또는 {브랜드}_META_EXTRA_AD_ACCOUNT_IDS(직접 지정)를 추가.",
  },
  {
    id: "google_ads",
    label: "구글 광고",
    shared: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"],
    perBrand: ["GOOGLE_ADS_CUSTOMER_ID"],
    note: "개발자 토큰 불필요(2026-09 종료). 접근 수준은 OAuth 클라이언트의 Cloud 프로젝트(Explorer 이상) 기준. refresh token은 adwords 범위.",
  },
  {
    id: "youtube",
    label: "유튜브",
    shared: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    perBrand: ["YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CHANNEL_ID"],
    note: "채널마다 로그인 동의가 필요(브랜드 채널은 브랜드 계정으로 선택). refresh token은 '유튜브 연결하기'로 발급(youtube.readonly, 1회 표시).",
  },
  {
    id: "ga4",
    label: "웹사이트 (GA4)",
    shared: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GA_REFRESH_TOKEN"],
    perBrand: ["GA4_PROPERTY_ID"],
    note: "읽기 전용(analytics.readonly). 두 속성에 모두 접근 권한이 있는 구글 계정으로 토큰을 발급.",
  },
  {
    id: "revenue",
    label: "실매출 (실제 결제 기준)",
    shared: [],
    perBrand: [],
    extra: {
      houscaper: ["POLAR_ACCESS_TOKEN"],
      topogenesis: ["TOPOGENESIS_POLAR_ACCESS_TOKEN"],
    },
    fallback: {
      houscaper: ["HOUSCAPER_SUPABASE_URL", "HOUSCAPER_SUPABASE_READONLY_KEY"],
      topogenesis: ["TOPOGENESIS_SUPABASE_URL", "TOPOGENESIS_SUPABASE_READONLY_KEY"],
    },
    note: "두 브랜드 모두 Polar 주문 기준(브랜드별 조직의 읽기 전용 토큰, orders:read). Polar 토큰이 없으면 그 브랜드의 Supabase purchase 테이블로 대신 센다.",
  },
  {
    id: "purchase_db",
    label: "결제 DB (Supabase purchase)",
    shared: [],
    perBrand: ["SUPABASE_URL", "SUPABASE_READONLY_KEY"],
    note: "브랜드 앱의 purchase 테이블(읽기 전용 키, RLS로 select만). Polar가 있으면 실매출은 Polar 기준이고 이 값은 대조용으로 함께 보이며, Polar가 없으면 이 값이 실매출이 된다.",
  },
  {
    id: "vercel",
    label: "사이트·배포 (Vercel)",
    shared: ["VERCEL_API_TOKEN", "VERCEL_TEAM_ID"],
    perBrand: ["VERCEL_PROJECT_ID"],
    note: "브랜드 사이트의 프로덕션 배포 기록과 Web Analytics(방문자·페이지뷰·상위 페이지·유입·국가). 토큰은 팀 범위로 발급. Web Analytics가 꺼진 프로젝트면 배포 기록만 보인다.",
  },
  {
    id: "reddit",
    label: "레딧",
    shared: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
    perBrand: ["REDDIT_REFRESH_TOKEN", "REDDIT_AD_ACCOUNT_ID"],
    note: "광고 API는 별도 접근 신청이 필요할 수 있음. refresh token은 카드의 '레딧 연결하기'로 발급(adsread, 1회 표시).",
  },
  {
    id: "tiktok",
    label: "틱톡",
    shared: ["TIKTOK_APP_ID", "TIKTOK_APP_SECRET"],
    perBrand: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_ADVERTISER_ID"],
    note: "광고 조회는 Marketing API. 게시(Content Posting)는 앱 심사 전엔 비공개로만 올라감.",
  },
];

export type PlatformStatus = {
  platform: PlatformDef;
  missing: string[];
  connected: boolean;
  viaFallback: boolean; // 기본 자격증명 대신 이전 방식(fallback)으로 연결됨
};

export function statusFor(brand: BrandId, env: NodeJS.ProcessEnv = process.env): PlatformStatus[] {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  return PLATFORMS.map((platform) => {
    const needed = [
      ...platform.shared,
      ...platform.perBrand.map((n) => `${prefix}_${n}`),
      ...(platform.extra?.[brand] ?? []),
    ];
    const missing = needed.filter((k) => !env[k]);
    const fb = platform.fallback?.[brand];
    const viaFallback = missing.length > 0 && !!fb && fb.every((k) => env[k]);
    return { platform, missing, connected: missing.length === 0 || viaFallback, viaFallback };
  });
}

// 필수는 아니지만 읽는 환경변수. 없으면 기본값을 쓴다.
export const OPTIONAL_ENV = [
  "{BRAND}_META_BUSINESS_ID", // 비즈니스 포트폴리오 ID — 그 아래 광고 계정(인스타 프로모션 전용 계정 포함)을 자동으로 찾는다(business_management 권한)
  "{BRAND}_META_EXTRA_AD_ACCOUNT_IDS", // 추가로 읽을 광고 계정 ID(쉼표 구분, 숫자 또는 act_숫자)
  "REFERRER_BLOCKLIST", // 리워드·클릭팜(PTC) 유입 차단 도메인을 더 추가(쉼표 구분, 두 브랜드 공통). 기본 목록은 lib/blocklist.ts
  "{BRAND}_REFERRER_BLOCKLIST", // 위와 같은 용도, 그 브랜드만
  "REFERRER_BLOCK_PATTERNS", // PTC 이름 패턴 추가(rupee·2pay·2click·paid4·earn·cashtree 등 국내 리워드 앱 이름은 기본 포함, 쉼표 구분)
  "REFERRER_ALLOWLIST", // 패턴에 잘못 걸린 정상 도메인을 풀어 줌
  "INTERNAL_EXCLUDE_CITIES", // 운영자 본인 접속을 GA4 도시 기준으로 제외(쉼표 구분, 예: Gwacheon-si)
  "{BRAND}_INTERNAL_EXCLUDE_CITIES", // 위와 같은 용도, 그 브랜드만(공통 값에 더해짐)
  "{BRAND}_SIGNUP_TABLE", // 신규 가입 집계 뷰/테이블(가입 시각 컬럼만 읽음). 기본 signups — 만드는 SQL 은 README
  "{BRAND}_SIGNUP_DATE_COLUMN", // 가입 시각 컬럼. 기본 created_at
  "{BRAND}_PRIMARY_KPI", // 핵심 전환 signups|orders (기본: 토포제네시스 signups, 하우스케이퍼 orders)
  "FX_USD_KRW", // 통화가 섞인 광고비(예: 메타 USD + 구글 KRW)를 원화로 합칠 때 쓰는 달러 환율(원). 기본 1400 — 실시간 환율이 아니라 고정값
  "FX_RATES", // 통화별 환율 추가·덮어쓰기: "USD=1380,JPY=9.2,EUR=1500"
  "AD_REASSIGN_RULES", // 다른 브랜드 광고로 옮길 이름 규칙: "패턴=>브랜드; …" (기본: 이름에 topo → topogenesis)
  "AD_REASSIGN_LINK_HOSTS", // 링크 도메인 규칙: "도메인=>브랜드; …" (기본: topogenesis.xyz)
  "AD_REASSIGN_EXCEPT", // 옮기지 않을 이름 패턴(예외)
  "AD_EVENT_MARKERS", // 일별 그래프에 직접 찍을 날짜: "날짜|라벨|브랜드; …" (브랜드 생략 시 둘 다). 중지·시작 날짜 추정보다 우선
  "AD_REASSIGN_DEFAULTS", // off 면 기본 재분류 규칙을 끈다
  "{BRAND}_GOOGLE_ADS_LOGIN_CUSTOMER_ID", // 브랜드별 관리자(MCC) ID. none 이면 헤더를 보내지 않는다(공통 값보다 우선)
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID", // 관리자(MCC) 계정으로 접근할 때만
  "GOOGLE_ADS_API_VERSION", // 기본 v25. 구버전은 정해진 날짜에 종료된다
  "DASHBOARD_UTC_OFFSET_HOURS", // 실매출 날짜 경계. 기본 9(한국)
  "REDDIT_REDIRECT_URI", // 레딧 앱에 등록한 redirect. 기본은 접속한 사이트 주소(루트)
  "YOUTUBE_REDIRECT_URI", // 구글 클라이언트에 등록한 redirect. 기본은 {사이트}/api/youtube/callback
  // 아래는 브랜드 접두사(HOUSCAPER_/TOPOGENESIS_)를 붙여 쓴다
  "{BRAND}_PURCHASE_TABLE", // 기본 purchase
  "{BRAND}_PURCHASE_DATE_COLUMN", // 기본 created_at
  "{BRAND}_PURCHASE_AMOUNT_COLUMN", // 기본 amount (빈 값이면 건수만 집계)
  "{BRAND}_PURCHASE_CURRENCY", // 기본 KRW
  "{BRAND}_PURCHASE_AMOUNT_DIVISOR", // 기본 1 (금액이 센트 단위면 100)
] as const;

// 이 앱이 읽지 않는 환경변수. 다른 용도가 없으면 Vercel에서 정리해도 된다. (이 앱은 지우지 않는다)
export const UNUSED_ENV = [
  "META_ACCESS_TOKEN", // 브랜드별 HOUSCAPER_/TOPOGENESIS_META_ACCESS_TOKEN 으로 대체됨
  "META_AD_ACCOUNT_ID", // 브랜드별 값으로 대체됨
  "HOUSCAPER_META_PAGE_ID",
  "TOPOGENESIS_META_PAGE_ID", // 조회에 쓰지 않음
  "META_BUSINESS_PORTFOLIO_ID",
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  "INSTAGRAM_HANDLE",
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_PAGE_NAME",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
  "GOOGLE_ADS_DEVELOPER_TOKEN", // 2026-09-09 개발자 토큰 종료. 있어도 보내지 않는다
] as const;
