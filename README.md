# ad-monitor

하우스케이퍼 · 토포제네시스 두 브랜드의 메타 · 구글 광고 · 유튜브 · 레딧 · 틱톡 성과를 한 화면에서 확인하는 읽기 전용 대시보드. Windsor 없이 플랫폼 API를 직접 연결한다. Vercel 배포.

## 단계
1. (현재) 두 브랜드 탭 + 플랫폼별 연결 상태 + 비밀번호 잠금
2. 플랫폼 연결 — 유튜브 → 메타 → 구글 광고 → 레딧 → 틱톡 순
3. 게시 기능 (확인 창 + 비밀번호 잠금 뒤에서만)

## 환경변수 (Vercel 프로젝트 설정에만 입력 — 채팅·커밋에 값을 쓰지 말 것)
- `DASHBOARD_PASSWORD` — 사이트 접속 비밀번호. 비어 있으면 로그인이 닫힌 채로 실패한다.
- 공통 자격증명과 브랜드별 값의 전체 목록은 `lib/platforms.ts` 의 `PLATFORMS`. 브랜드별 값은 `HOUSCAPER_…` / `TOPOGENESIS_…` 접두사를 붙인다.
  화면의 각 카드가 "아직 없는 변수 이름"을 그대로 보여 준다.

## 연결에 필요한 환경변수 (Vercel에만 입력 — 값은 채팅·커밋에 쓰지 말 것)
정확한 목록과 누락 여부는 화면 카드와 `lib/platforms.ts` 의 `PLATFORMS` 가 기준이다. 브랜드별 값은 `HOUSCAPER_` / `TOPOGENESIS_` 접두사.

| 플랫폼 | 공통 | 브랜드별 | OAuth scope |
|---|---|---|---|
| GA4 | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GA_REFRESH_TOKEN` | `GA4_PROPERTY_ID` | `analytics.readonly` |
| 실매출 | — | 하우스케이퍼 `POLAR_ACCESS_TOKEN` / 토포제네시스 `TOPOGENESIS_SUPABASE_URL`, `TOPOGENESIS_SUPABASE_READONLY_KEY` | Polar: 읽기 전용(주문 조회) 토큰 |
| 구글 광고 | `GOOGLE_ADS_REFRESH_TOKEN` (+ OAuth 클라이언트) | `GOOGLE_ADS_CUSTOMER_ID` (숫자 10자리) | `adwords` |
| 유튜브 | OAuth 클라이언트 | `YOUTUBE_REFRESH_TOKEN`, `YOUTUBE_CHANNEL_ID` | `youtube.readonly` |
| 메타 | — | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` | `ads_read` |

속성·계정 ID (비밀이 아님): GA4 속성 하우스케이퍼 `555914097` / 토포제네시스 `487961539`, 구글 광고 고객 ID 하우스케이퍼 `8556065657` / 토포제네시스 `5133039562`.

구글 광고 개발자 토큰은 2026-09-09에 종료됐다. 접근 수준(Explorer/Basic 등)은 OAuth 클라이언트가 속한 Google Cloud 프로젝트(`ferrous-arena-510513-p2`)에 붙으므로, refresh token은 반드시 이 프로젝트의 클라이언트(`GOOGLE_OAUTH_CLIENT_ID`)로 발급해야 한다.

선택 env(없으면 기본값): `GOOGLE_ADS_LOGIN_CUSTOMER_ID`(관리자 계정으로 접근할 때), `GOOGLE_ADS_API_VERSION`(기본 v25), `DASHBOARD_UTC_OFFSET_HOURS`(기본 9), `TOPOGENESIS_PURCHASE_TABLE`(purchase) · `_DATE_COLUMN`(created_at) · `_AMOUNT_COLUMN`(amount, 빈 값이면 건수만) · `_CURRENCY`(KRW) · `_AMOUNT_DIVISOR`(1).

이 앱이 읽지 않는 env(`lib/platforms.ts` 의 `UNUSED_ENV`): `META_ACCESS_TOKEN`·`META_AD_ACCOUNT_ID`(공통 이름), `GOOGLE_ADS_DEVELOPER_TOKEN`(종료), `*_META_PAGE_ID`, `META_BUSINESS_PORTFOLIO_ID`, `INSTAGRAM_*`, `FACEBOOK_PAGE_*`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`. 다른 용도가 없을 때만 정리한다.

## 의심 트래픽 판정 (`lib/traffic.ts`)
- 데이터센터 도시: Ashburn, Boardman, Council Bluffs, The Dalles, Drexel Hill, Columbus (목록은 `DATACENTER_CITIES`).
- 낮은 참여: 표본 5세션 이상이고 세션당 평균 참여시간이 5초 미만인 소스/매체·국가. 국가 판정은 데이터센터 행을 뺀 뒤 계산한다.
- 실사용자 추정 = 활성 사용자 − (데이터센터 도시 + 낮은 참여 국가의 사용자). 소스/매체 플래그는 표시만 하고 차감하지 않는다(지역과 겹칠 수 있음).

## 릴스 게시 도구 (대시보드와 분리)
대시보드는 읽기 전용이고, 게시는 별도 명령줄 도구 `scripts/publish-reel.mjs` 가 한다. 게시 토큰은 Vercel에 넣지 않는다.

1. `.env.example` 을 `.env.publish` 로 복사해 값을 채운다 (`HOUSCAPER_IG_USER_ID`, `HOUSCAPER_IG_PUBLISH_TOKEN` 등). `.env.publish` 는 git에 올라가지 않는다.
2. 미리보기: `node scripts/publish-reel.mjs --brand houscaper --video-url https://… --caption "문구"`
3. 실제 게시: 같은 명령 끝에 `--yes` 를 붙인다. `--no-feed` 를 붙이면 피드에는 올리지 않는다.

조건: 인스타그램 비즈니스/크리에이터 계정이 페이스북 페이지에 연결돼 있어야 하고, 토큰에 `instagram_content_publish` 권한이 있어야 하며, 영상은 공개 https 주소여야 한다. 게시 전용 토큰은 읽기 전용 토큰과 따로 발급한다.
