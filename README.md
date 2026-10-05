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
| 실매출 | — | 하우스케이퍼 `POLAR_ACCESS_TOKEN` / 토포제네시스 `TOPOGENESIS_POLAR_ACCESS_TOKEN` | Polar 조직 토큰, `orders:read` |
| 결제 DB (Supabase purchase) | — | `SUPABASE_URL`, `SUPABASE_READONLY_KEY` | purchase 테이블 select만 허용한 읽기 전용 키 |
| 사이트·배포 (Vercel) | `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID` | `VERCEL_PROJECT_ID` | 팀 범위 토큰(읽기만 사용) |
| 구글 광고 | `GOOGLE_ADS_REFRESH_TOKEN` (+ OAuth 클라이언트) | `GOOGLE_ADS_CUSTOMER_ID` (숫자 10자리) | `adwords` |
| 유튜브 | OAuth 클라이언트 | `YOUTUBE_REFRESH_TOKEN`, `YOUTUBE_CHANNEL_ID` | `youtube.readonly` |
| 메타 | — | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` (+선택 `META_BUSINESS_ID`, `META_EXTRA_AD_ACCOUNT_IDS`) | `ads_read` (+`business_management`: 비즈니스 ID로 자동 탐색할 때) |

속성·계정 ID (비밀이 아님): GA4 속성 하우스케이퍼 `555914097` / 토포제네시스 `487961539`, 구글 광고 고객 ID 하우스케이퍼 `8556065657` / 토포제네시스 `5133039562`.

Vercel 프로젝트 ID (비밀이 아님): 팀 `team_O2UwFZ4PRZM3d3laZ0qo0Q3L`, 하우스케이퍼 사이트 `prj_YujoHG1apHBdbaRBcL5ke3sd78YZ`(houscaper) / 토포제네시스 사이트 `prj_poUfsSXZeDAOxDYpdkZgwxEzvB9s`(topo-genesis-3djs).
Vercel 토큰: vercel.com → Account Settings → Tokens → 범위를 이 팀으로, 만료일 지정. 대시보드는 배포 목록·프로젝트 정보·Web Analytics 조회(GET)만 한다. 방문자·페이지뷰는 각 사이트 프로젝트에서 **Analytics(Web Analytics)를 켜야** 보이고, 꺼져 있으면 배포 기록만 보인다.

구글 광고 개발자 토큰은 2026-09-09에 종료됐다. 접근 수준(Explorer/Basic 등)은 OAuth 클라이언트가 속한 Google Cloud 프로젝트(`ferrous-arena-510513-p2`)에 붙으므로, refresh token은 반드시 이 프로젝트의 클라이언트(`GOOGLE_OAUTH_CLIENT_ID`)로 발급해야 한다.

### 실매출 — Polar 우선, Supabase 대조/대체
두 브랜드 모두 Polar 주문(`/v1/orders`, 결제 완료만)으로 센다. Polar 조직 토큰은 그 조직의 주문만 보이므로 브랜드마다 따로 발급한다.
각 브랜드 앱 DB의 purchase 테이블도 읽는다(`HOUSCAPER_SUPABASE_URL`·`HOUSCAPER_SUPABASE_READONLY_KEY` / `TOPOGENESIS_SUPABASE_URL`·`TOPOGENESIS_SUPABASE_READONLY_KEY`). 연결 상태는 화면의 "결제 DB (Supabase purchase)" 카드에 브랜드별로 보인다.

| Polar 토큰 | Supabase URL+키 | 실매출 패널 |
|---|---|---|
| 있음 | 있음 | Polar 기준 + 아래에 "대조: Supabase purchase N건 — Polar와 일치/차이" |
| 있음 | 없음 | Polar 기준 (결제 DB 카드는 "연결 필요") |
| 없음 | 있음 | Supabase purchase 기준 + Polar 전환 안내 |
| 없음 | 없음 | 연결 필요 |

Supabase 읽기 전용 키: purchase 테이블에 `select`만 허용하는 RLS 정책을 둔 키를 쓴다(service_role 키 금지). 컬럼 이름이 다르면 `{브랜드}_PURCHASE_*` 선택 env로 맞춘다.

토포제네시스 Polar 토큰 넣는 순서(하우스케이퍼는 기존 `POLAR_ACCESS_TOKEN` 그대로):
1. Polar 대시보드에서 **토포제네시스 조직**으로 전환 → Settings → Developers → New token, 권한은 `orders:read`만.
2. Vercel에 `TOPOGENESIS_POLAR_ACCESS_TOKEN`(Sensitive, Production)으로 넣고 재배포한다. 값은 채팅·커밋에 쓰지 않는다.
3. 실매출 패널 상단이 "Polar"로 바뀌면 끝. 토큰이 없으면 Supabase purchase 테이블로 대신 세고, 패널에 "Supabase purchase (이전 방식)"과 전환 안내가 보인다.
4. Supabase env는 지우지 않아도 된다. 남겨 두면 Polar와 건수가 맞는지 대조값으로 계속 보인다.

선택 env(없으면 기본값): `GOOGLE_ADS_LOGIN_CUSTOMER_ID`(관리자 계정으로 접근할 때), `GOOGLE_ADS_API_VERSION`(기본 v25), `DASHBOARD_UTC_OFFSET_HOURS`(기본 9), Supabase purchase 컬럼(브랜드 접두사): `{브랜드}_PURCHASE_TABLE`(purchase) · `_DATE_COLUMN`(created_at) · `_AMOUNT_COLUMN`(amount, 빈 값이면 건수만) · `_CURRENCY`(KRW) · `_AMOUNT_DIVISOR`(1).

이 앱이 읽지 않는 env(`lib/platforms.ts` 의 `UNUSED_ENV`): `META_ACCESS_TOKEN`·`META_AD_ACCOUNT_ID`(공통 이름), `GOOGLE_ADS_DEVELOPER_TOKEN`(종료), `*_META_PAGE_ID`, `META_BUSINESS_PORTFOLIO_ID`, `INSTAGRAM_*`, `FACEBOOK_PAGE_*`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`. 다른 용도가 없을 때만 정리한다.

## 화면 구성과 광고 효과 추출
한 화면에서 탭으로 전환한다(선택한 탭은 주소 `#해시`에 남음, 폰에서는 하단 고정 바).
- **한눈에 보기**: 결론·다음 할 일, 광고비(채널 비중 띠), 1명당·참여 1회당·결제 1건당 비용, 퍼널 그래프, 일별 흐름(광고비/클릭/방문자 토글), 운영 체크.
- **광고 효과**: 채널·캠페인마다 `효과 있음 / 점검 / 낭비 / 보류` 판정, 가장 효과적/가장 큰 낭비/측정 안 됨, 내보내기.
- **매출·사이트**: 실매출(Polar·Supabase), GA4, Vercel. **광고 상세**: 메타·구글 광고·유튜브. **연결**: 아직 연결 안 된 플랫폼(있을 때만).

광고 효과 판정(`lib/effect.ts`): 광고 플랫폼의 비용·클릭과 GA4 캠페인×소스/매체 리포트(`sessionCampaignName`, 데이터센터 도시는 요청 단계에서 제외)를 **캠페인 이름이 같을 때만** 잇는다(공백·기호 무시). 메타는 광고 링크에 `utm_campaign`(캠페인 이름)이 있어야 잡히고, 구글은 자동 태그(gclid)로 캠페인 이름이 들어온다. 새로 필요한 env는 없다.

| 판정 | 기준 |
|---|---|
| 보류 | 클릭 20 미만 또는 GA4 연결 세션 10 미만 |
| 낭비 | 참여율 10% 미만, 또는 참여 1회당 비용이 평균의 3배 이상 |
| 점검 | 참여율 10~40%, 또는 참여는 좋은데 평균보다 비쌈 |
| 효과 있음 | 참여율 40% 이상이고 참여 1회당 비용이 평균 이하 |

참여 = GA4 참여 세션. 실제 결제(Polar·Supabase)는 어느 채널에서 왔는지 나눌 수 없어 판정에 쓰지 않는다. GA4 캠페인 리포트를 못 읽으면 모든 캠페인이 보류가 되고 안내가 뜬다.

내보내기(`내보내기` 버튼): 담을 내용(퍼널·채널·캠페인·일별)과 형식을 고르면 CSV(`/api/export?brand=&range=|from=&to=&parts=&caveat=`, UTF-8 BOM, 엑셀 수식 주입 방지) 내려받기 또는 요약 텍스트 복사. 대시보드 로그인이 필요하고, 파일에는 집계 숫자와 캠페인 이름만 들어가며 토큰·계정 ID는 없다.

## 메타: 인스타그램 프로모션(부스트) 읽기
Business Suite·인스타그램 앱의 "게시물 홍보"는 Ads Manager 대표 계정이 아니라 **다른 광고 계정**에 생기는 경우가 많다(대표 계정에 캠페인이 0이어도 지출이 있을 수 있음). 같은 Marketing API(`/{act}/insights`)로 읽으므로, 그 광고 계정까지 브랜드 설정에 넣으면 대시보드에 합산되고 "프로모션(부스트)" 줄·계정별 목록·캠페인 상태(진행 중/일시중지 …)로 보인다.
- `{브랜드}_META_BUSINESS_ID` — 비즈니스 포트폴리오 ID. 그 비즈니스가 소유·대행하는 광고 계정(`owned_ad_accounts`, `client_ad_accounts`)을 **자동으로 찾아** 모두 읽는다. 토큰에 `business_management` 권한(+ 각 광고 계정 접근)이 필요하다.
- `{브랜드}_META_EXTRA_AD_ACCOUNT_IDS` — 추가로 읽을 광고 계정 ID(쉼표 구분, 숫자 또는 `act_숫자`). 비즈니스 ID 없이 직접 지정할 때.
- 토큰은 기존 `{브랜드}_META_ACCESS_TOKEN`을 그대로 쓴다. 시스템 사용자 토큰이라면 그 시스템 사용자에게 해당 광고 계정(자산)을 할당해야 한다.
- **브랜드는 섞이지 않는다**: 계정은 `{브랜드}_` 접두사 env에서만 읽고, 다른 브랜드에 설정된 계정이 탐색 결과에 나오면 이 브랜드 합계에서 뺀다(화면에 안내). 통화가 다른 계정은 합계에 넣지 않고 목록에만 보인다.
- 비밀이 아닌 ID 메모: 토포제네시스 Ads Manager `act_1087646437400340`, 비즈니스 `4491957361125359` / 하우스케이퍼 비즈니스 `1855343032512902`, 광고 계정 `act_567801815128070`.
- 프로모션 판별: 대표 계정이 아닌 계정의 캠페인 전부, 그리고 대표 계정에서도 이름이 "Instagram post…/부스트/홍보" 같은 패턴인 캠페인에 "프로모션" 표시가 붙는다. 상태는 `effective_status`.

## 리워드·클릭팜(PTC) 유입 제외 (`lib/blocklist.ts`)

cashlee.co, ad2click.co 같은 "클릭하면 돈 주는" 사이트에서 오는 유입은 사람이 아니라 대시보드를 오염시키므로, 공유 차단 목록으로 뺀다. 두 브랜드가 같은 목록을 쓴다.

- **GA4**: 합계·소스/매체·지역·캠페인 요청 모두에서 `sessionSource`가 목록 도메인(하위 도메인 포함)인 세션을 요청 단계에서 뺀다. 그래서 세션·사용자·참여율·광고 효과 판정이 서로 어긋나지 않는다. 얼마나 뺐는지는 GA4 카드 위에 "세션·사용자 제외"로 보인다.
- **Vercel**: "유입 사이트" 목록에서 빼고, 그 방문을 일별 방문자·페이지뷰에서도 뺀다. 제외량은 유입 사이트 아래에 보인다. 일별 차감 조회가 실패하면 "일별 방문자에는 반영하지 못함"이라고 표시한다.
- **확장**: 기본 목록(`DEFAULT_BLOCKED_REFERRERS`)에 도메인을 추가하거나, 코드 수정 없이 env로 더한다 — `REFERRER_BLOCKLIST=a.com,b.net`(공통), `HOUSCAPER_REFERRER_BLOCKLIST` / `TOPOGENESIS_REFERRER_BLOCKLIST`(브랜드별). 도메인만 적는다(`https://`·`www.` 는 알아서 정리, `notcashlee.co`처럼 이름만 비슷한 도메인은 걸리지 않음).
- **한계**: 리퍼러를 숨기는 PTC 트래픽(소스가 `(direct)`로 찍힘)은 도메인으로 가려낼 수 없다. 그런 경우는 기존 "의심 트래픽"(데이터센터 도시·참여 5초 미만) 판정이 따로 걸러 준다. Vercel 일별 차감은 선택 기간 상위 100개 유입 도메인 안에서만 찾는다.

## 레딧 refresh token 발급 (`/api/reddit/connect`)
1. `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `{브랜드}_REDDIT_AD_ACCOUNT_ID`가 있고 refresh token만 없으면 레딧 카드에 "레딧 연결하기" 버튼이 보인다.
2. **`https://ad-monitor-eight.vercel.app`에 로그인한 상태에서** 누른다. 레딧 앱의 redirect URI가 이 주소(루트)여야 한다. 다른 주소로 접속하면 redirect가 달라져 레딧이 거절한다(`REDDIT_REDIRECT_URI`로 고정 가능).
3. 레딧에서 허용하면 사이트 루트로 돌아오고, 미들웨어가 콜백(`/api/reddit/callback`)으로 넘겨 code를 refresh token으로 교환한다.
4. 토큰은 **한 번만 화면에 보이고** 서버 저장·캐시·로그는 하지 않는다. 그 값을 Vercel `{브랜드}_REDDIT_REFRESH_TOKEN`(Sensitive)에 넣고 재배포한다.

## 유튜브 refresh token 발급 (`/api/youtube/connect?brand=houscaper|topogenesis`)
1. **먼저 한 번만**: Google Cloud 콘솔(프로젝트 `ferrous-arena-510513-p2`) → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트(`GOOGLE_OAUTH_CLIENT_ID`) → 승인된 리디렉션 URI에 `https://ad-monitor-eight.vercel.app/api/youtube/callback` 추가. 없으면 `redirect_uri_mismatch`.
2. 유튜브 패널이 오류(예: `invalid_grant`)면 "유튜브 다시 연결", refresh token만 없으면 연결 필요 카드에 "유튜브 연결하기"가 보인다. **`https://ad-monitor-eight.vercel.app`에 로그인한 상태로** 누른다.
3. 구글 계정 선택 화면에서 **그 브랜드 채널을 가진 계정(브랜드 계정이면 브랜드 계정)**을 고른다. 범위는 `youtube.readonly` 하나만 요청한다.
4. 결과 화면이 채널(`{브랜드}_YOUTUBE_CHANNEL_ID`와 일치하는지), 권한(읽기 전용인지), 만료(Testing이면 약 7일)를 확인해 보여 주고, refresh token을 **한 번만** 보여 준다. Vercel `{브랜드}_YOUTUBE_REFRESH_TOKEN`(Sensitive)에 넣고 재배포한다.
5. **7일 만료**: OAuth 동의 화면이 Testing 상태면 refresh token이 7일 뒤 만료된다(`invalid_grant`). 콘솔 → OAuth 동의 화면(대상) → "앱 게시"로 프로덕션에 올린 뒤 다시 연결하면 만료되지 않는다. 같은 클라이언트를 쓰는 `GA_REFRESH_TOKEN`, `GOOGLE_ADS_REFRESH_TOKEN`도 같은 이유로 7일마다 끊길 수 있다.

## 의심 트래픽 판정 (`lib/traffic.ts`)
- 데이터센터 도시: Ashburn, Boardman, Council Bluffs, The Dalles, Drexel Hill, Columbus (목록은 `DATACENTER_CITIES`).
- 낮은 참여: 표본 5세션 이상이고 세션당 평균 참여시간이 5초 미만인 소스/매체·국가. 국가 판정은 데이터센터 행을 뺀 뒤 계산한다.
- 화면 기본값은 의심 트래픽을 뺀 실수치다: 사용자 = 활성 사용자 − (데이터센터 도시 + 낮은 참여 국가), 세션·참여 세션·참여시간·GA 구매도 같은 행을 뺀다(7일·28일 각각). 소스/매체 표는 낮은 참여 소스를 숨기되 합계에서는 빼지 않는다(지역과 겹칠 수 있음).
- 제외된 값은 GA4 패널 아래 접힌 "제외된 의심 트래픽 보기"에서만 보인다.

## 릴스 게시 도구 (대시보드와 분리)
대시보드는 읽기 전용이고, 게시는 별도 명령줄 도구 `scripts/publish-reel.mjs` 가 한다. 게시 토큰은 Vercel에 넣지 않는다.

1. `.env.example` 을 `.env.publish` 로 복사해 값을 채운다 (`HOUSCAPER_IG_USER_ID`, `HOUSCAPER_IG_PUBLISH_TOKEN` 등). `.env.publish` 는 git에 올라가지 않는다.
2. 미리보기: `node scripts/publish-reel.mjs --brand houscaper --video-url https://… --caption "문구"`
3. 실제 게시: 같은 명령 끝에 `--yes` 를 붙인다. `--no-feed` 를 붙이면 피드에는 올리지 않는다.

조건: 인스타그램 비즈니스/크리에이터 계정이 페이스북 페이지에 연결돼 있어야 하고, 토큰에 `instagram_content_publish` 권한이 있어야 하며, 영상은 공개 https 주소여야 한다. 게시 전용 토큰은 읽기 전용 토큰과 따로 발급한다.
