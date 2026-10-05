// D1: 플랫폼별 직접 연동(Windsor 미사용). 연결 상태는 환경변수 존재 여부로만 판단한다 — 값은 절대 화면/로그에 내지 않는다.
export type BrandId = "houscaper" | "topogenesis";
export type PlatformId = "meta" | "google_ads" | "youtube" | "ga4" | "revenue" | "reddit" | "tiktok";

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
    note: "브랜드마다 Meta 앱이 따로라 토큰도 브랜드별. 장기(60일) 토큰 또는 시스템 사용자 토큰 필요. 본인 계정만 쓰면 개발 모드로 심사 없이 가능.",
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
      topogenesis: ["TOPOGENESIS_SUPABASE_URL", "TOPOGENESIS_SUPABASE_READONLY_KEY"],
    },
    note: "두 브랜드 모두 Polar 주문 기준(브랜드별 조직의 읽기 전용 토큰, orders:read). 토포제네시스는 Polar 토큰이 없을 때만 예전 Supabase purchase 테이블로 대신 센다.",
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
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID", // 관리자(MCC) 계정으로 접근할 때만
  "GOOGLE_ADS_API_VERSION", // 기본 v25. 구버전은 정해진 날짜에 종료된다
  "DASHBOARD_UTC_OFFSET_HOURS", // 실매출 날짜 경계. 기본 9(한국)
  "REDDIT_REDIRECT_URI", // 레딧 앱에 등록한 redirect. 기본은 접속한 사이트 주소(루트)
  "YOUTUBE_REDIRECT_URI", // 구글 클라이언트에 등록한 redirect. 기본은 {사이트}/api/youtube/callback
  "TOPOGENESIS_SUPABASE_URL", // Polar 토큰이 없을 때만 쓰는 이전 방식(Supabase purchase)
  "TOPOGENESIS_SUPABASE_READONLY_KEY", // 〃
  "TOPOGENESIS_PURCHASE_TABLE", // 기본 purchase
  "TOPOGENESIS_PURCHASE_DATE_COLUMN", // 기본 created_at
  "TOPOGENESIS_PURCHASE_AMOUNT_COLUMN", // 기본 amount (빈 값이면 건수만 집계)
  "TOPOGENESIS_PURCHASE_CURRENCY", // 기본 KRW
  "TOPOGENESIS_PURCHASE_AMOUNT_DIVISOR", // 기본 1 (금액이 센트 단위면 100)
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
