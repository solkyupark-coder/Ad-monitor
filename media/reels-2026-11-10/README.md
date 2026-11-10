# 레이저 커터 사용자용 릴스 (2026-11-10 제작)

요청: ad-monitor 메시지함 11/6 20:50Z "Ad reel request". 레이저 커터를 가진 메이커 대상, 영어, 9:16, 15~25초, 사이트 실제 화면 녹화만 사용.

- `reel-laser-en.mp4`: 22초, 가격 없음 (기본).
- `reel-laser-en-price.mp4`: 24.8초, 결제 화면($3 / $9)과 끝 화면 가격 줄 포함.
- 1080×1920, 30fps. 음악은 직접 만든 곡(src/maker_music.py, 로파이 그루브 D장조 104bpm), -14 LUFS.
- 흐름: 완성된 모던 빌라 회전("Got a laser cutter? Cut this house.") → 스타일 고르기 → 블록 5번 탭해서 쌓기 → 도면 → 기계별 시트 크기(Glowforge 495×279, xTool M1 385×300, xTool S1 498×319) → 무료 스타일 도면 받기와 이메일 받기 카드 → (가격 버전만) 결제 화면 → 끝 화면 houscaper.xyz.
- 화면은 전부 houscaper-app main(8ed0b9a)을 로컬에서 띄워 휴대폰 크기(432×768)로 찍은 실제 화면. src/cap*.mjs가 녹화 스크립트, src/rec/가 원본 프레임, src/reel12.html이 편집본(?l=en 가격 없음, ?l=enp 가격 있음).
- 녹화 메모: GPU 없는 컨테이너라 3D 화면은 한 장에 60~120초. 브라우저 두 개를 동시에 돌리면 탭이 안 먹으니 하나씩만 돌릴 것. 서랍(drawer) 화면은 screenshot의 animations:'disabled'가 있어야 제대로 찍힘. 시트 크기는 select라서 selectOption으로 바꿈.

## 캡션
가격 없음:
Got a laser cutter? Design a miniature house in your browser. Pick a style, stack blocks, then download cut sheets sized for your machine: Glowforge 495 × 279 mm, xTool M1, xTool S1 or your own sheet size. SVG and DXF files with an assembly guide. 3 styles are free to download, no sign-up. houscaper.xyz
#lasercut #glowforge #xtool #lasercutfiles #miniaturehouse

가격 있음:
Got a laser cutter? Design a miniature house in your browser. Pick a style, stack blocks, then download cut sheets sized for your machine: Glowforge 495 × 279 mm, xTool M1, xTool S1 or your own sheet size. SVG and DXF files with an assembly guide. 3 styles are free. Premium styles are $3 each, or $9 for all 10. houscaper.xyz
#lasercut #glowforge #xtool #lasercutfiles #miniaturehouse

Shorts 제목: Design a laser-cut miniature house in your browser #shorts
