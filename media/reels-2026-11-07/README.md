# 크리스마스 목조 집 탭 빌드 릴스 (2026-11-07 제작)

요청(11/7 12:24 KST): "영상 크리스마스 하나 풀어야대는디". 기존 크리스마스 릴스 2개(10/22, 10/24)는 이미 게시돼서 새로 만듦.

- `reel-xmas2-<ko|en|ja|tw>.mp4`: 1080×1920, 30fps, 28초, 가격 없음.
- 음악: src/xmas_music.py로 직접 편곡한 "O Tannenbaum"(전래곡, 퍼블릭 도메인). 3/4 왈츠 F장조 100bpm, 첼레스타 멜로디 + 피치카토 움파파 + 썰매방울, 20.3초 '완성' 차임. 이전 징글벨과 다름. -14 LUFS.
- 흐름: 눈 내리는 배경 + MERRY CHRISTMAS 표지판 → 앱 christmas 기본 집(makePreset, 348칸)이 22번 탭으로 지어짐 → 한 바퀴 회전 → 디테일 칩(눈 덮인 지붕·목조 골조·현관 리스·빨간 창가 화분) → 도면 레이저(christmas-sheet-1) → 조각 날아가 조립 → 완성! → 한 바퀴 회전 → 끝 화면.
- 도면 7장, 겹침 검사 box 0 / path 0 / 3D 0 (houscaper-app scripts/_xm.ts, 커밋 안 함).
- 캡처: zoom 1.2, tgt 0.45,4.05,-0.45, Scene.tsx 로컬 패치(?tgt=, window.__az, 커밋 안 함). stages.sh는 bash로 실행.

## 캡션
KO: 눈 내리는 독일 크리스마스 목조 집을 톡톡 눌러 지어봤어요. 눈 덮인 지붕, 목조 골조, 현관 리스, 빨간 창가 화분까지. 다 지으면 레이저로 자를 도면이 바로 나오고, 잘라서 조립하면 진짜 미니어처 집 완성. 로그인 없이 바로. houscaper.xyz/?start=christmas
#크리스마스 #미니어처하우스 #레이저커팅 #크리스마스장식 #DIY
EN: A snowy German Christmas timber house, built tap by tap. Snowy roofs, timber framing, a door wreath and red window boxes. Then get the laser-cut drawings, cut, glue, and it is a real miniature house. No sign-up. houscaper.xyz/?start=christmas
#christmas #christmasdecor #miniaturehouse #lasercut #diy
JA: 雪のドイツのクリスマスの木組みの家を、タップでトントン建ててみた。雪の屋根、木組み、玄関のリース、赤い窓辺の花箱まで。できあがったらレーザーで切れる図面がすぐ出て、切って組めば本物のミニチュアハウス。登録なしですぐ。houscaper.xyz/?start=christmas
#クリスマス #ミニチュアハウス #レーザーカット #クリスマス飾り #ハンドメイド
TW: 點一點蓋出下雪的德國聖誕木屋。積雪屋頂、半木構架、門上花圈、紅色窗台花箱通通有。蓋好直接生成雷射切割圖紙，切好組起來就是真的微縮屋。免註冊，立即開始。houscaper.xyz/?start=christmas
#聖誕節 #聖誕裝飾 #微縮模型 #雷射切割 #手作

## Shorts 제목
KO 눈 내리는 크리스마스 집을 톡톡 눌러 지었다 #shorts / EN Tap-building a snowy Christmas house #shorts / JA タップで雪のクリスマスハウス #shorts / TW 點一點蓋出下雪的聖誕小屋 #shorts
