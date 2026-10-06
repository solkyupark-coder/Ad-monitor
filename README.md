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

속성·계정 ID (비밀이 아님): GA4 속성 하우스케이퍼 `555914097` / 토포제네시스 `487961539`, 구글 광고 고객 ID 하우스케이퍼 `5133039562` / 토포제네시스 `9021418629`(하이픈 없이 10자리, 하이픈이 있어도 숫자만 읽는다), 관리자(MCC) `8554198133`. 이전 README의 `8556065657`·"토포제네시스 `5133039562`"는 잘못된 표기였다. 이 ID는 계정 전환 때 바뀔 수 있으니, 화면의 "고객 ID …" 오류 문구와 항상 대조한다.

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
- **이름 패턴**: 도메인 목록에 없어도 호스트 이름에 `rupee`·`2pay`·`2click`·`paid4`·`earn`이 있으면 PTC로 본다(`adsrupee.com`은 목록에도 있다). `earn`은 `learn.microsoft.com`·`yearn…` 같은 정상 단어를 피하려고 앞 글자가 `l`·`y`가 아닐 때만 건다(그래서 `easyearn…`은 못 잡는다 — 그런 건 도메인으로 `REFERRER_BLOCKLIST`에 추가). 패턴 추가: `REFERRER_BLOCK_PATTERNS=freecash,gpt4`(영문·숫자·`-`, 3~30자). 잘못 걸린 정상 도메인은 `REFERRER_ALLOWLIST=a.example.com`으로 풀어 준다(차단보다 우선).
- **국내 리워드(앱테크) 앱**: `cashtree.co`·`cashwalk.com`·`cashslide.co.kr`·`adpopcorn.com`을 목록에 넣었고, 이름 패턴으로 `cashtree`·`cashwalk`·`cashslide`·`cashthat`·`cashmong`·`cashhour`·`cashdoc`·`cashcharge`·`adpopcorn`도 건다. `cash` 전체를 거는 패턴은 `cashew`·`cashier`·`cashback` 같은 정상 단어를 잡으므로 쓰지 않았다. 토스(`toss.im`)는 리워드 전용 주소를 확인하지 못했고 통째로 막으면 일반 토스 유입까지 사라지므로 기본 목록에 넣지 않았다 — 원하면 `REFERRER_BLOCKLIST=toss.im`으로 추가한다. 다른 앱(캐시댓 등)은 같은 방식으로 `REFERRER_BLOCKLIST`·`REFERRER_BLOCK_PATTERNS`에 더한다.
- **한계**: 리퍼러를 숨기는 PTC 트래픽(소스가 `(direct)`로 찍힘)은 도메인으로 가려낼 수 없다. 그런 경우는 기존 "의심 트래픽"(데이터센터 도시·참여 5초 미만) 판정이 따로 걸러 준다. Vercel 일별 차감은 선택 기간 상위 100개 유입 도메인 안에서만 찾는다.


## 통화가 섞인 광고비 (`lib/fx.ts`)

메타(USD)와 구글(KRW)처럼 통화가 달라도 광고비가 "-"로 비지 않게 한다.

- **지출 0인 통화는 무시**한다(그날 지출이 없는 USD 계정 때문에 합계가 막히지 않는다). 지출 있는 통화가 하나뿐이면 그 통화 그대로 보인다.
- **둘 이상 지출이 있으면 원화로 환산**해 합계·채널별 비중·그래프 막대를 만든다. 화면 광고비 밑에 "원화 환산 합계 — 원통화 10 USD + 7,000원 · 환율 1 USD = 1,400원"처럼 원통화와 환율을 같이 적는다. 환율을 모르는 통화(예: EUR)가 섞이면 예전처럼 합치지 않고 이유를 알린다.
- **환율은 고정값**이다(실시간 아님 — 규모를 보는 용도). 기본 `1 USD = 1,400원`, `FX_USD_KRW=1380`으로 바꾸거나 `FX_RATES=USD=1380,JPY=9.2,EUR=1500`으로 통화를 추가한다(`FX_RATES`가 우선).
- 다른 브랜드 계정에서 옮겨 온 캠페인의 통화가 받는 쪽 광고 계정 통화와 다르면, 받는 쪽 통화로 환산해 합치고 캠페인 표에 `원통화 16,286원` 칩을 붙인다. 받는 쪽 자체 지출이 0이면 옮겨 온 쪽 통화를 그대로 쓴다(환산 없음).

## 본인(운영자) 접속 제외 (`lib/internal.ts`)

내가 직접 접속한 기록이 방문자로 잡히는 것(예: 직접 유입 11명이 전부 과천)을 GA4 도시 기준으로 뺀다.

- **설정**: `INTERNAL_EXCLUDE_CITIES=Gwacheon-si`(두 브랜드 공통, 쉼표 구분, GA4 `city` 값 그대로·대소문자 무시). 한 브랜드만이면 `HOUSCAPER_INTERNAL_EXCLUDE_CITIES` / `TOPOGENESIS_INTERNAL_EXCLUDE_CITIES`(공통 값에 더해진다). 설정이 없으면 아무것도 빼지 않는다. 값은 GA4 → 보고서 → 지역(도시)에서 보이는 철자를 그대로 쓴다.
- **적용**: 합계·소스/매체·지역·캠페인·일별·시간별 실사용자 요청에서 모두 요청 단계에서 뺀다(PTC 제외와 같은 방식). 뺀 양은 GA4 패널 위와 한눈에 보기 "사이트 실사용자" 줄에 "본인 제외 N명"으로 보인다.
- **한계**: 도시 기준이라 같은 도시의 다른 방문자도 함께 빠진다(운영자가 사는 곳이 인구가 큰 도시면 가린다 — 과천처럼 작은 도시에서만 권한다). 집·사무실·모바일 데이터에서 도시가 다르게 찍히면 그 도시도 추가한다. Vercel Web Analytics 방문자는 도시 필터를 쓰지 않아 이 제외가 적용되지 않는다.
- **더 정확한 방법(제안, 이 대시보드 밖의 설정)**:
  1. **GA4 내부 트래픽 필터** — 관리 → 데이터 스트림 → 태그 설정 → 내부 트래픽 정의(IP 주소 규칙) → 관리 → 데이터 필터에서 "Internal Traffic"을 *활성*으로. 고정 IP가 있을 때 가장 정확하다.
  2. **쿠키 표시** — 사이트(앱) 쪽에서 운영자가 로그인했거나 `?internal=1`로 한 번 들어오면 쿠키를 심고, 그 쿠키가 있으면 `gtag('set', { traffic_type: 'internal' })`를 보낸다. GA4 데이터 필터가 `traffic_type = internal`을 걸러 준다. 도시가 바뀌어도 되고 같은 도시의 다른 방문자를 지우지 않는다.

## 구글 광고: 관리자(MCC) 로그인 ID와 `USER_PERMISSION_DENIED`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`(공통)는 **관리자 계정 아래에 있는 고객 계정**을 읽을 때만 필요하다. 관리자 아래가 아닌 계정(직접 초대받은 계정)에 이 헤더를 보내면 `USER_PERMISSION_DENIED`가 난다. 두 브랜드 계정의 위치가 다를 수 있으므로 **브랜드별 값**이 공통 값보다 우선한다: `{HOUSCAPER|TOPOGENESIS}_GOOGLE_ADS_LOGIN_CUSTOMER_ID`. 관리자 없이 직접 접근하는 계정이면 `none`으로 둔다(헤더를 아예 보내지 않음).
- 설정을 잘못 맞춰도 읽히게 하려고, 헤더를 보냈는데 권한 오류가 나면 **헤더 없이 한 번 더** 시도하고 성공하면 그 사실을 구글 광고 카드 위에 알린다. 둘 다 거절되면 오류 문구에 보낸 로그인 ID, 고객 ID, 확인할 것(하이픈 없는 10자리 / 토큰 발급 계정이 그 고객 또는 관리자에 사용자로 초대돼 있는지)이 나온다.
- 캠페인 목록 조회만 실패하면(합계는 성공) 이제 카드 위에 이유가 나온다. 예전에는 조용히 빈 목록이었다.
- **토큰 재발급이 필요할 때**: `GOOGLE_ADS_REFRESH_TOKEN`은 **그 광고 계정(또는 관리자 계정)에 사용자로 초대된 구글 계정**으로 발급해야 한다. 지금은 관리자 855-419-8133에 접근하는 `sk9288go@gmail.com`이어야 한다. 순서: ① 그 계정으로 구글 광고에 로그인해 두 고객 ID(`5133039562`, `9021418629`)가 목록에 보이는지 확인 ② OAuth 클라이언트(`GOOGLE_OAUTH_CLIENT_ID`, 프로젝트 `ferrous-arena-510513-p2`)로 `https://www.googleapis.com/auth/adwords` 범위만 동의해 refresh token 발급(같은 클라이언트여야 접근 수준이 따라온다) ③ Vercel `GOOGLE_ADS_REFRESH_TOKEN`(Sensitive)을 교체하고 재배포. 값은 채팅에 붙이지 않는다.

## 광고비 귀속 재분류 (`lib/attribution.ts`, `lib/merge.ts`)
다른 브랜드 광고가 이 브랜드 광고 계정에서 결제되는 경우(예: Houscaper 계정으로 집행한 Topogenesis 인스타 부스트·구글 캠페인)를 올바른 브랜드 화면으로 옮긴다.
- **기본 규칙**: 캠페인 이름에 `topo`(대소문자 무시)가 있거나, 광고 링크 도메인이 `topogenesis.xyz`(하위 도메인 포함)면 Topogenesis. 메타는 소재(creative) 안의 URL, 구글은 광고 최종 URL로 본다. 링크는 응답 모양이 달라도 문자열로 훑는 최선 추정이라 **이름 규칙을 같이 두는 게 확실하다**.
- **옮겨진 캠페인**: 원래 브랜드의 합계·일별·캠페인 표에서 빠지고(일별에서도 뺀다), 받는 브랜드 화면에 "Houscaper 계정에서 결제됨" 표시와 함께 합계·캠페인 표·광고 효과 판정에 들어간다. 받는 브랜드 자체 계정이 실패(예: 구글 `CUSTOMER_NOT_ENABLED`)해도 옮겨 온 캠페인은 보이고 실패 알림은 그대로 남는다. 통화가 다르면 합치지 않고 알린다(자체 지출이 0이면 옮겨 온 쪽 통화로 맞춘다).
- **env 로 확장(코드 수정 없음, 공통)**:
  - `AD_REASSIGN_RULES="Same site=>topogenesis; 대지 경계=>topogenesis; 용도 이름만=>topogenesis"` — 이름에 패턴(대소문자 무시)이 있으면 그 브랜드로. `;` 로 여러 개.
  - `AD_REASSIGN_LINK_HOSTS="example.com=>topogenesis"` — 링크 도메인 규칙 추가(기본 `topogenesis.xyz`는 항상 포함).
  - `AD_REASSIGN_EXCEPT="topography; 하우스 topo"` — 이름에 이게 있으면 옮기지 않는다(예외, 규칙보다 우선).
  - `AD_REASSIGN_DEFAULTS=off` — 기본 규칙(`topo`, `topogenesis.xyz`)을 끈다.
- **한계**: 메타는 선택 기간에 지출이 있는 캠페인만 본다. 이름에 `topo`가 들어간 다른 브랜드 캠페인(예: "topography")은 예외 규칙으로 막는다.

## 캠페인 상태: 집행 중 / 중지됨 / 삭제됨 (`lib/campaign-state.ts`)
- 상태는 **API 기준**이다. Google Ads `campaign.status`(ENABLED / PAUSED / REMOVED), Meta 캠페인 `effective_status`·`configured_status`(PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, DELETED, ARCHIVED …). 삭제·보관된 캠페인도 읽으려고 상태 필터를 명시해서 요청한다.
- **부스트**는 캠페인은 켜져 있는데 광고만 꺼지는 경우가 있어서, 그 캠페인의 광고(`/ads`) 상태도 같이 읽고 **돌고 있는 광고가 하나도 없으면** 중지됨(광고가 모두 삭제·보관이면 삭제됨)으로 본다. 검토 중·반려·문제 있음은 우리가 끈 게 아니므로 집행 중으로 두고 따로 칩을 보인다.
- 광고 상세·광고 효과 표의 캠페인 행마다 상태 배지(집행 중 / 중지됨 / 삭제됨)가 붙고, **꺼진 행은 이름·숫자·막대가 회색으로 흐려진다**(배지는 또렷하게, 집행 중 이름은 굵게). 긴 캠페인 이름은 두 줄까지 보이고(폰에서는 전부 줄바꿈) 마우스를 올리면 전체 이름이 툴팁으로 나온다. 다른 브랜드 계정에서 결제된 행의 "Houscaper 계정에서 결제됨" 표시는 그대로 유지한다.
- **이미 꺼진 캠페인에는 행동 제안을 하지 않는다**: '가장 큰 낭비 의심'·'예산을 옮길 후보'·낭비 비중 카드는 집행 중인 캠페인만 근거로 삼고, 꺼진 쪽 낭비는 "이미 중지됨 (중지 전 지출 X원)" 과거 기록(정보 단계)으로 낮춘다. 한 채널의 캠페인이 모두 꺼져 있으면 클릭당 비용 경고·광고 설정 제안도 같은 기록으로 낮춘다.
- 한계: 상태는 읽는 시점 기준이다(중지한 날짜는 모른다). 지출은 선택한 기간 전체이며 "중지 전 지출"로 표시한다. Meta 광고 상태는 한 번에 500개까지만 읽는다.

## 1일 보기: 오늘 / 어제 (`?range=today`, `?range=1`)
- 기간 선택에 **오늘**(오늘 0시부터 지금까지, `DASHBOARD_UTC_OFFSET_HOURS` 기준 KST)과 **어제**(하루 전체)가 있다. URL은 `?brand=houscaper&range=today` / `range=1`. 브랜드 분리는 그대로다.
- **비교**: 어제는 그제 하루와, 오늘은 **어제 같은 시각까지**(0~지금 시)와 견준다. 오늘은 하루가 안 끝나 카드의 "직전 기간 대비"를 숨기고, 비교는 한눈에 보기의 시간별 그래프와 그 위의 "오늘 0~N시 vs 어제 같은 시각까지" 요약에서 본다(어제 선은 점선으로 하루 전체).
- **시간별 그래프**(한눈에 보기): 광고비(막대)·사용자·클릭·결제를 0~23시 칸에 그린다. 시간별로 읽을 수 있는 소스만: GA4 `dateHour`(실사용자), Meta 시간별 breakdown `hourly_stats_aggregated_by_advertiser_time_zone`, Google Ads `segments.hour`, Vercel Web Analytics `by=hour`(GA4가 없을 때 방문자로 대체), 결제(Polar·Supabase 주문 시각). **안 되는 소스는 선·막대를 그리지 않고 하루 합계만** 그래프 아래에 적는다. 다른 브랜드 계정에서 결제된 캠페인은 시간별에서도 원래 브랜드에서 빼고 받는 브랜드에 더한다("Houscaper 계정에서 결제됨" 유지).
- **판정 보류**: 1일은 표본이 작아 효과 판정(낭비 의심·점검·효과 있음)을 모두 "보류"로 두고, 한눈에 보기 결론도 "판정 보류"로 바꾸며, 퍼널 해석은 참고로 낮추고, 클릭당 비용·방문자 급감 경고는 만들지 않는다. 숫자만 보고, 판단은 7일 이상으로 본다.
- 시간대는 소스마다 자기 설정을 따른다(Meta·Google 광고 계정 시간대, GA4 속성 시간대, Vercel은 UTC를 `DASHBOARD_UTC_OFFSET_HOURS`로 변환). 시간대가 다르면 시간이 어긋나 보일 수 있다. Vercel 시간별 응답 필드는 실제 응답으로 확인하지 못해 넓게 읽는다(`hour`·`timestamp`·`key`). 오늘 보기의 최신 값은 소스별 반영 지연(GA4 수십 분~몇 시간, Meta 수 분~)으로 낮게 보일 수 있다.

## 한눈에 보기: 겹쳐 그리는 일별 그래프 (`components/ComboChart.tsx`, `lib/combo.ts`, `lib/events.ts`)
- 브랜드마다(상단 브랜드 전환) 따로 한 장: **광고비(막대, 왼쪽 축) + 실사용자·클릭(선, 오른쪽 축) + 결제(마커 줄)**. 직전 같은 길이 기간은 같은 색의 흐린 점선(결제는 속 빈 마커)으로 겹친다. KPI 카드는 그래프 위에 그대로 있다.
- **범례를 누르면 지표를 켜고 끈다**(끄면 그 축도 사라지고 남은 지표로 눈금이 다시 잡힌다). 마우스를 올리거나 터치·←→ 키로 그날 수치 툴팁(직전 기간 같은 날 값 포함). "표로 보기"에 같은 값이 표로 있다.
- 두 축(왼쪽 원, 오른쪽 명·번)은 요청에 따른 선택이다. 오해를 줄이려고 축 제목에 어느 지표의 축인지 적고, 막대는 왼쪽·선은 오른쪽으로만 쓰며, 정확한 값은 툴팁과 표에 둔다. 광고비 통화가 두 채널에서 다르면 막대는 그리지 않는다.
- **실사용자 일별**은 GA4(`date` 차원)에서 데이터센터 도시와 PTC 유입을 요청 단계에서 뺀 값이다. 기간 전체 "실사용자"(낮은 참여 국가까지 뺀 값)보다 약간 많을 수 있다. **결제 일별**은 Polar(없으면 Supabase) 주문 시각을 `DASHBOARD_UTC_OFFSET_HOURS` 기준 날짜로 센다.
- **광고를 켜고 끈 날짜(세로선 + 라벨)**: API는 중지한 날짜를 주지 않아서, 캠페인별 일별 지출로 **추정**한다 — 지금 꺼져 있는(중지·삭제) 캠페인의 마지막 지출일 다음 날이 중지, 이전에 지출이 없다가 기간 안에서 처음 지출이 잡힌 날이 시작(점선 세로선 = 추정). 상태가 켜져 있는 캠페인은 지출이 끊겨도 중지로 보지 않는다. 지출 큰 순으로 6개까지.
- **정확한 날짜를 직접 찍으려면** env `AD_EVENT_MARKERS="2026-10-06|hc_2610 시작|houscaper; 2026-10-03|Site to Mass 중지|topogenesis"` (날짜|라벨|브랜드, 브랜드를 빼면 두 브랜드 모두, `;`로 여러 개). 직접 찍은 건 실선이고 추정보다 우선한다. 조회 기간 밖 날짜(예: 오늘 시작)는 세로선 대신 그래프 아래 "기간 밖 표시"에 적힌다(조회 기간은 어제까지).
- 한계: 메타 캠페인별 일별은 한 번에 최대 6쪽까지, 캠페인 목록은 상위 50개까지만 읽는다. 광고 소스·GA4·결제 중 하나가 없으면 그 지표는 범례에서 비활성(회색)으로 남고 이유가 툴팁에 나온다.

## GA4 실사용자 vs Vercel 방문자 비교 (`compareVisitors`, `lib/traffic.ts`)
큰 쪽 기준 차이 비율 `|V − G| / max(V, G)`: 10% 미만 "비슷하다", 10~20% "약간 차이"(원인 한 줄), **20% 이상 "차이 큼"**과 가능한 원인(봇 제외 기준 차이, 광고 차단기·추적 방지, 동의 배너, 기간이 길면 Vercel이 일별 방문자의 합이라 재방문이 중복 집계됨)을 보여 준다. 기준값은 `VISITOR_DIFF_NOTICE`·`VISITOR_DIFF_BIG`.

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
