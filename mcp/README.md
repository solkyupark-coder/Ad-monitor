# ad-monitor-mcp

브랜드 프로젝트(ad-monitor·토포제네시스·하우스케이퍼)가 함께 쓰는 MCP 서버. Vercel 프로젝트 `ad-monitor-mcp`(대시보드와 별개)에 이 폴더만 배포한다.

- 주소: `https://ad-monitor-mcp.vercel.app/m/<MCP_KEY>` (모든 도구) · `/m/open` (읽기 도구만)
- 이전에는 소스가 배포 파일로만 있었다(v1.4.0). 2.0.0부터 이 폴더가 원본이다.

## 도구

| 도구 | 하는 일 | 공개 게시 |
|---|---|---|
| get_daily_status · get_metrics · read_messages | 일일 상황·세부 수치·메시지 읽기 | – |
| post_message | 프로젝트 간 메시지 | – |
| upload_video_from_url | 영상을 공개 Blob에 올려 주소 받기 | – |
| post_reel · publish_reel | 인스타 릴스 | 사용자 확인 후 |
| upload_youtube_video | 유튜브 (기본 비공개) | public/unlisted는 확인 후 |
| reddit_check_subreddit · reddit_my_posts | 서브레딧 규칙·내 글 반응 | – |
| reddit_submit_post | 레딧 글 | `confirm=true`일 때만 (없으면 미리보기) |
| etsy_shop_info · etsy_find_category | 배송 프로필·카테고리 ID 찾기 | – |
| etsy_create_draft_listing | 엣시 상품 **초안**(손님에게 안 보임) | – |
| etsy_publish_listing | 초안 공개(수수료 0.20달러) | `confirm=true`일 때만 |
| tiktok_upload_video | 기본: 틱톡 앱 **초안함**. `mode=direct`는 바로 게시 | direct는 `confirm=true`일 때만 |
| tiktok_post_status | 틱톡 처리 상태 | – |

## 환경변수 (이름만)

기존: `MCP_KEY`, `EDGE_CONFIG_ID`, `EDGE_CONFIG_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `REELS_READ_WRITE_TOKEN`, `IG_TOKEN_{TOPO|HOUSCAPER}`, `IG_USER_ID_{TOPO|HOUSCAPER}`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `YT_UPLOAD_TOKEN_{TOPO|HOUSCAPER}`

새로:
- 레딧: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` (토포 전용 앱이면 `REDDIT_CLIENT_ID_TOPO`, `REDDIT_CLIENT_SECRET_TOPO`), `REDDIT_POST_TOKEN_{TOPO|HOUSCAPER}`
- 엣시: `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_PUBLISH_TOKEN_{TOPO|HOUSCAPER}`
- 틱톡: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_UPLOAD_TOKEN_{TOPO|HOUSCAPER}`

게시용 토큰은 대시보드 '연결' 탭 아래 '자동 게시용 토큰' 버튼으로 받는다(한 번만 보여 줌). 대시보드에는 넣지 않는다.

## 배포

```
cd mcp && vercel deploy --prod   # 프로젝트 ad-monitor-mcp (team topo4)
```
