# 뉴욕 브라운스톤 릴스 (2026-11-01 제작)

요청(11/1 23:58 KST): "릴스 뉴욕그거로해서 하나 만들어줘", "음악두 다른거".

- `reel-newyork-<ko|en|ja|tw>.mp4`: 1080×1920, 30fps, 28초, 가격 없음.
- 음악: src/ny_music.py로 직접 합성한 스윙 재즈(F장조 132bpm, 피아노 컴핑, 워킹 베이스, 라이드, 뮤트 트럼펫풍 멜로디, 21.0초 '완성' 히트). 이전 릴스 음악과 다름.
- 흐름: 뉴욕 거리 표지판(BROWNSTONE ST) + 스카이라인 배경 → 앱 newyork 기본 집이 22번 탭으로 지어짐 → 한 바퀴 회전 → 디테일 칩(비상계단·옥상 물탱크·코니스·벽돌 3색) → 벽돌 벽 도면 레이저(newyork-sheet-1) → 조각 날아가 조립 → 완성! → 한 바퀴 회전 → 끝 화면.
- 집: makePreset('newyork') (468칸), 도면 4장, 겹침 검사 box 0 / path 0 / 3D 0 (scripts/_ny.ts).
- 캡처: zoom 1.2, tgt -0.45,4.86,-0.45, Scene.tsx 로컬 패치(?tgt=, window.__az 회전; 커밋 안 함).

다시 만들기: houscaper-app에서 `npx tsx scripts/_ny.ts <src/a>` → next dev :3000 → `src/stages.sh`, `src/rot.sh` → `python3 src/conv.py`(src에서) → `python3 -m http.server 8765`(src) → `PAGE=reel10.html node render.mjs <l>` → ffmpeg + music-ny.wav.

## 캡션
KO: 뉴욕 거리의 오래된 벽돌집을 톡톡 눌러 지어봤어요. 비상계단, 옥상 물탱크, 코니스 장식, 3색 벽돌까지. 다 지으면 레이저로 자를 도면이 바로 나오고, 잘라서 조립하면 진짜 미니어처 집 완성. 로그인 없이 바로. houscaper.xyz/?start=newyork
#미니어처하우스 #레이저커팅 #뉴욕 #브라운스톤 #DIY
EN: An old New York walk-up, built tap by tap. Fire escapes, a rooftop water tower, cornices and three brick colors. Then get the laser-cut drawings, cut, glue, and it is a real miniature house. No sign-up. houscaper.xyz/?start=newyork
#newyork #brownstone #miniaturehouse #lasercut #nyc
JA: ニューヨークの古いレンガの家を、タップでトントン建ててみた。非常階段、屋上の給水塔、コーニス、3色のレンガまで。できあがったらレーザーで切れる図面がすぐ出て、切って組めば本物のミニチュアハウス。登録なしですぐ。houscaper.xyz/?start=newyork
#ニューヨーク #ブラウンストーン #ミニチュアハウス #レーザーカット #建築模型
TW: 點一點蓋出紐約街頭的老磚房。逃生梯、屋頂水塔、簷口裝飾、三色紅磚通通有。蓋好直接生成雷射切割圖紙，切好組起來就是真的微縮屋。免註冊，立即開始。houscaper.xyz/?start=newyork
#紐約 #褐石公寓 #微縮模型 #雷射切割 #建築模型

## Shorts 제목
KO 뉴욕 벽돌집을 톡톡 눌러 지었다 #shorts / EN Tap-building a New York brownstone #shorts / JA タップでニューヨークのレンガの家 #shorts / TW 點一點蓋出紐約褐石公寓 #shorts
