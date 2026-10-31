# 빌라 사보아 탭 빌드 릴스 (2026-10-30 제작, 10/31용)

요청(10/30 22:41 KST): 이미지로 모던 빌라(빌라 사보아)를 탭해서 만드는 릴스.

- `reel-savoye-ko.mp4`: 1080×1920, 30fps, 28초, 가격 없음, 음악 src/music28.wav(music23 늘림). EN/JA/TW는 KO 확정 후 렌더.
- 미리보기: https://claude.ai/artifact/9wXMogZLgaVbsLrKA8RSvE
- 흐름: 사용자가 준 실제 사진(src/a/photo.jpg, 260×208 원본 업스케일) → 오른쪽 위 썸네일 → 22번 탭해 지어짐 → 다 지은 집 한 바퀴 회전(10.3–12.5초) → 이미지 = 완성 집 → 모던 빌라 도면 레이저 → 조각 조립 → 완성! → 완성 집 한 바퀴 회전(a/rot 90장, Scene.tsx window.__az 로컬 패치, caprot.mjs) → 끝 화면.
- 집 모양: 앱 갤러리 샘플 Villa Savoye (houscaper-app public/samples/villa-savoye.json, 1213칸). 도면 6장, 겹침 검사 0/0/0. 캡처 zoom 0.9 tgt 0.2,3.3,0.2, URL이 길어 project= 대신 localStorage houscaper-v2로 넣음(capone.mjs). shapes/A는 첫 시안(안 씀).

다시 만들기: houscaper-app에서 Scene.tsx에 ?tgt= 로컬 패치(커밋 안 함, 10-24 src 참고), `npx tsx scripts/_sv.ts <dir>`, `_svstage.ts <json> <dir>`, `_svsheet.ts`, next dev → `src/stages.sh`(capone.mjs, zoom 1.25, tgt -0.45,4.05,-0.45) → r→s/d/meta 변환(파이썬, README 아래 메모) → `src/ref.html` → `PAGE=reel9.html node src/render.mjs <l>` → ffmpeg + music23.wav.

## 캡션
KO: 빌라 사보아 사진 한 장 보고, 톡톡 눌러 그대로 지어봤어요. 필로티, 가로 띠창, 옥상 정원까지. 다 지으면 레이저로 자를 도면이 바로 나오고, 잘라서 조립하면 진짜 미니어처 집 완성. 로그인 없이 바로. houscaper.xyz
#미니어처하우스 #레이저커팅 #빌라사보아 #르코르뷔지에 #DIY
EN: One photo of Villa Savoye, rebuilt tap by tap. Pilotis, ribbon windows, roof garden and all. Then get the laser-cut drawings, cut, glue, and it is a real miniature house. No sign-up. houscaper.xyz
#villasavoye #lecorbusier #miniaturehouse #lasercut #architecture
JA: サヴォア邸の写真を1枚見ながら、タップでそのまま建ててみた。ピロティ、横長の窓、屋上庭園まで。できあがったらレーザーで切れる図面がすぐ出て、切って組めば本物のミニチュアハウス。登録なしですぐ。houscaper.xyz
#サヴォア邸 #ル・コルビュジエ #ミニチュアハウス #レーザーカット #建築模型
TW: 看著一張薩伏伊別墅的照片，點一點就蓋出來。底層架空柱、水平長窗、屋頂花園通通有。蓋好直接生成雷射切割圖紙，切好組起來就是真的微縮屋。免註冊，立即開始。houscaper.xyz
#薩伏伊別墅 #柯比意 #微縮模型 #雷射切割 #建築模型

## Shorts 제목
KO 사진 한 장 보고 톡톡, 빌라 사보아 완성 #shorts / EN Villa Savoye from one photo, tap by tap #shorts / JA 写真1枚からタップでサヴォア邸 #shorts / TW 一張照片點一點蓋出薩伏伊別墅 #shorts
