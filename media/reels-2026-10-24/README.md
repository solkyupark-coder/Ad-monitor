# 설명 릴스: 톡톡 눌러 짓고 → 스타일 바꾸고 → 도면 (2026-10-24)

요청: 와이프가 기존 릴스를 보고 뭐 하는 프로그램인지 모르겠다고 함. 집이 지어지는 모습 → 스타일 변경 → 도면이 보이게.

- `reel-explain-{ko,en,ja,tw}.mp4`: 1080×1920, 30fps, 21초, 가격 없음. v1/(하얀 블록 쌓기), v2/(블록 + 새 집 모양)은 이전 시안.
- 구성: 0–6초 한옥이 탭마다 한 칸씩 지어짐(앱 capture 모드로 뽑은 27단계, 새 부분이 위에서 떨어짐 + 탭 표시) → 6–13초 같은 집이 네덜란드 → 성 → 크리스마스 목조집(빛 줄 스윕) → 13–17초 크리스마스 집 실제 재단 도면(sheetSvg)을 레이저 점이 그림 → 18–19초 실제 조립 사진(etsy hanok-05-real 왼쪽) → 끝 화면.
- 집 모양: src/_reel_house.ts 변형 a (본채 4×3×12 + 별채 3×2×6 + 탑 2×2×15).
- 다시 만들기: houscaper-app에서 `npx tsx scripts/_reel_house.ts <out> a christmas`, `next dev` 후 src/capstyles.mjs(스타일별, zoom 1.35)·src/capstage.mjs(27단계; Scene.tsx에 ?tgt= 로컬 패치 필요, src/Scene-tgt-patch.tsx, 커밋 안 함). 그다음 `src/reel8.html?l=ko|en|ja|tw` + `node src/render.mjs <l>` + ffmpeg(src/music21.wav, castle 릴스의 어쿠스틱 21초).

## 캡션
KO: 이게 뭐 하는 앱이냐면요. 톡톡 누를 때마다 집이 한 칸씩 지어지고, 스타일은 한 번에 바뀌고, 다 만들면 레이저로 바로 자를 수 있는 도면이 나와요. 자르고 조립하면 진짜 미니어처 집. 로그인 없이 바로. houscaper.xyz
#미니어처하우스 #레이저커팅 #DIY #한옥 #집짓기
EN: Here is what this app does. Tap and your house builds up piece by piece, swap the whole style in one go, and get laser-cut drawings for exactly what you made. Cut, glue, and it is a real miniature house. No sign-up. houscaper.xyz
#miniaturehouse #lasercut #diy #dollhouse #designyourown
JA: このアプリでできること。タップするたびに家ができていって、スタイルもまるごと変えられて、できあがったらレーザーで切れる図面がすぐ出てくる。切って組み立てれば本物のミニチュアハウス。登録なしですぐ。houscaper.xyz
#ミニチュアハウス #レーザーカット #DIY #ドールハウス #自分でデザイン
TW: 這個 App 在做什麼？點一下房子就長一點，風格也能整個換掉，做好就直接生成雷射切割圖紙。切好組起來，就是真的微縮屋。免註冊，立即開始。houscaper.xyz
#微縮模型 #雷射切割 #DIY #娃娃屋 #自己設計

## Shorts 제목
KO 톡톡 눌러 집 짓고 도면까지 #shorts / EN Tap to build a house, get the cut files #shorts / JA タップで家をつくって図面まで #shorts / TW 點一點蓋房子，圖紙馬上有 #shorts
