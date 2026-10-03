// D1: 플랫폼별 직접 연동(Windsor 미사용). 연결 상태는 환경변수 존재 여부로만 판단한다 — 값은 절대 화면/로그에 내지 않는다.
export type BrandId = "houscaper" | "topogenesis";
export type PlatformId = "meta" | "google_ads" | "youtube" | "reddit" | "tiktok";

export const BRANDS: { id: BrandId; label: string; prefix: string }[] = [
  { id: "houscaper", label: "하우스케이퍼", prefix: "HOUSCAPER" },
  { id: "topogenesis", label: "토포제네시스", prefix: "TOPOGENESIS" },
];

type PlatformDef = {
  id: PlatformId;
  label: string;
  shared: string[]; // 두 브랜드 공통 자격증명
  perBrand: string[]; // `${PREFIX}_${name}` 형태로 브랜드마다 필요
  note: string;
};

export const PLATFORMS: PlatformDef[] = [
  {
    id: "meta",
    label: "메타 (페이스북·인스타 광고)",
    shared: ["META_ACCESS_TOKEN"],
    perBrand: ["META_AD_ACCOUNT_ID", "META_PAGE_ID"],
    note: "Meta 개발자 앱 + 장기 액세스 토큰. 본인 계정만 쓰면 개발 모드로 심사 없이 가능.",
  },
  {
    id: "google_ads",
    label: "구글 광고",
    shared: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"],
    perBrand: ["GOOGLE_ADS_CUSTOMER_ID"],
    note: "개발자 토큰 승인에 며칠 걸릴 수 있음.",
  },
  {
    id: "youtube",
    label: "유튜브",
    shared: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    perBrand: ["YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CHANNEL_ID"],
    note: "채널마다 로그인 동의가 필요(브랜드 채널은 브랜드 계정으로 선택).",
  },
  {
    id: "reddit",
    label: "레딧",
    shared: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
    perBrand: ["REDDIT_REFRESH_TOKEN", "REDDIT_AD_ACCOUNT_ID"],
    note: "광고 API는 별도 접근 신청이 필요할 수 있음.",
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
};

export function statusFor(brand: BrandId, env: NodeJS.ProcessEnv = process.env): PlatformStatus[] {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  return PLATFORMS.map((platform) => {
    const needed = [...platform.shared, ...platform.perBrand.map((n) => `${prefix}_${n}`)];
    const missing = needed.filter((k) => !env[k]);
    return { platform, missing, connected: missing.length === 0 };
  });
}
