# 차별점 릴스: 복셀이 아니라 BMC (2026-11-18 제작)

요청(11/18 09:17 KST): 하우스케이퍼가 다른 것과 다른 점. 복셀이 아니라 BMC라서 자유도가 있고 실제 제작이 가능하다는 것.

- `reel-bmc-<ko|en|ja|tw>.mp4`: 1080×1920, 30fps, 27.5초, 가격 없음.
- 흐름: 회색 복셀 블록 쌓기(장갑 탭, "똑같은 네모 / 화면 밖으로 못 나와요") → BMC 설명(한 칸의 모서리 8개를 읽어 벽·지붕·창문) → 같은 블록이 크리스마스 목조집으로 변함 → 같은 모양이 성·뉴욕·일본·한옥으로 → 한옥 도면 레이저 → 조각이 날아가 조립 → 완성, 360도 회전 → 같은 한옥의 MDF 모습("MDF로 만들면 이런 모습") → 끝 화면.
- 집 모양: 10/24 설명 릴스의 맞춤 집(본채+별채+탑, src/data). 캡처는 11/18 앱 최신 화면, zoom 1.35, tgt 0,4.05,0, Scene.tsx 로컬 패치(?tgt=, window.__az, 커밋 안 함).
- 음악: 10/15 자작 어쿠스틱(music-b-acoustic) 4초부터 27.5초.
- BMC는 화면에 약자로만 표기(풀네임은 넣지 않음). 마지막 MDF 이미지는 실제로 자른 모형이 아님: 앱 MDF 화면 캡처(?mdf=1 로컬 패치, src/capmdf.mjs)를 마루 배경에 합성(src/mkreal.py). 처음엔 실제 사진(01-real-mdf.jpg)을 썼으나 11/18 10:59 KST 사용자가 별로라고 해서 교체.
- a/ 폴더의 글꼴·three.js는 reels-2026-11-07/src/a 것을 그대로 씀.

## 캡션
KO: 보통 집짓기 앱은 복셀 블록을 쌓아요. 하우스케이퍼는 복셀이 아니라 BMC. 칸마다 이웃 8칸을 읽고 벽, 지붕, 창문 중 딱 맞는 부품이 됩니다. 그래서 모양도 스타일도 자유롭고, 전부 진짜 부품이라 레이저로 자를 도면이 바로 나와요. 자르고 끼우면 화면 속 집이 책상 위에. 로그인 없이 바로. houscaper.xyz
#미니어처하우스 #레이저커팅 #집짓기게임 #복셀 #DIY
EN: Most house builders stack voxel blocks. Houscaper is not voxels, it is BMC: every cell reads its 8 neighbors and becomes the right part, a wall, a roof or a window. So you get free shapes and any style, and because every part is real, the laser-cut files come out instantly. Cut, snap together, and the house on your screen sits on your desk. No sign-up. houscaper.xyz
#miniaturehouse #lasercut #voxel #cozygames #diy
JA: ふつうの家づくりアプリはボクセルを積むだけ。houscaperはボクセルではなくBMC。マスごとに周り8マスを読んで、壁・屋根・窓のぴったりの部品になります。だから形もスタイルも自由で、ぜんぶ本物の部品だからレーザーで切る図面がすぐ出ます。切ってはめれば、画面の家が机の上に。登録なしですぐ。houscaper.xyz
#ミニチュアハウス #レーザーカット #ボクセル #ハンドメイド #箱庭ゲーム
TW: 一般蓋房子 App 只是堆體素方塊。houscaper 不是體素，是 BMC：每一格讀取周圍 8 格，變成牆、屋頂或窗戶中剛好的零件。所以形狀和風格都自由，而且全是真的零件，雷射切割圖紙馬上生成。切好卡上去，螢幕裡的房子就來到桌上。免註冊，立即開始。houscaper.xyz
#微縮模型 #雷射切割 #體素 #手作 #療癒遊戲

## Shorts 제목
KO 복셀이 아니라 BMC, 그래서 진짜로 만들 수 있다 #shorts / EN Not voxels. BMC. So you can really build it #shorts / JA ボクセルじゃなくBMC、だから本当に作れる #shorts / TW 不是體素，是 BMC，所以真的做得出來 #shorts

## 게시 (11/18 ~14:40 KST, 광고 없음)
IG: KO https://www.instagram.com/reel/Df3xcMEDrIL/ · EN https://www.instagram.com/reel/Df3xV-vjjN4/ · JA https://www.instagram.com/reel/Df3xWIRDD9o/ · TW https://www.instagram.com/reel/Df3xbRzkfCw/
YouTube: KO https://youtu.be/gahtXVR6FG8 · EN https://youtu.be/ZL4CpD3ygnw · JA https://youtu.be/aVQLl5FcIYQ · TW https://youtu.be/eDcS4Lxuru8
