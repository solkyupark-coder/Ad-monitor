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

## 릴스 게시 도구 (대시보드와 분리)
대시보드는 읽기 전용이고, 게시는 별도 명령줄 도구 `scripts/publish-reel.mjs` 가 한다. 게시 토큰은 Vercel에 넣지 않는다.

1. `.env.example` 을 `.env.publish` 로 복사해 값을 채운다 (`HOUSCAPER_IG_USER_ID`, `HOUSCAPER_IG_PUBLISH_TOKEN` 등). `.env.publish` 는 git에 올라가지 않는다.
2. 미리보기: `node scripts/publish-reel.mjs --brand houscaper --video-url https://… --caption "문구"`
3. 실제 게시: 같은 명령 끝에 `--yes` 를 붙인다. `--no-feed` 를 붙이면 피드에는 올리지 않는다.

조건: 인스타그램 비즈니스/크리에이터 계정이 페이스북 페이지에 연결돼 있어야 하고, 토큰에 `instagram_content_publish` 권한이 있어야 하며, 영상은 공개 https 주소여야 한다. 게시 전용 토큰은 읽기 전용 토큰과 따로 발급한다.
