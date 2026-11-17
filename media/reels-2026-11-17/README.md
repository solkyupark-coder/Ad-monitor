# 스타일별 BGM 릴스 (2026-11-17 제작)

요청(11/17 11:28 KST): "릴스하나 BGM 살려서". 앱에 새로 들어간 스타일별 음악(houscaper-app PR #226/#227, Suno 곡 14개)을 보여주는 릴스.

- `reel-bgm-<ko|en|ja|tw>.mp4`: 1080×1920, 30fps, 27.6초, 가격 없음.
- 흐름: 3초마다 집이 바뀌고 음악도 같이 바뀜. 한옥(국악) → 일본 성(고토) → 멕시코(마리아치) → 독일 목조(폴카) → 바이킹(북유럽 포크) → 페르시아(산투르) → 뉴욕(비밥) → 크리스마스(재즈 왈츠) → 끝 화면 "14가지 집, 14가지 음악".
- 음악: 앱에 실린 실제 트랙(houscaper-app public/sound/music/<style>.mp3)을 3초씩 잘라 이어 붙임(src/mix.py). 새로 작곡한 소리 없음. -14 LUFS. 화면의 막대는 실제 소리 크기를 따라 움직임(src/a/audio.json).
- 집 화면: 앱 캡처 모드(?capture=1)로 각 스타일 기본 집을 -14°~+14° 돌려가며 21장씩 찍음(src/caprot.mjs, rotall.sh). Scene.tsx CaptureCamera에 window.__az 회전을 로컬로만 덧붙임(커밋 안 함). 그래픽카드가 없어 한 장에 15~20초, 한 번에 하나만 돌려야 함.
- 렌더: `python3 -m http.server 8765`(src에서) 후 `LANGS="ko en ja tw" bash renderall.sh`.

## 캡션
KO: 집마다 음악이 달라요 🔊 한옥은 국악, 일본 성은 고토, 멕시코 마을은 마리아치, 독일 목조 집은 폴카, 뉴욕은 비밥 재즈. 스타일을 고르면 그 집에 어울리는 음악이 흘러요. 톡톡 눌러 짓고, 도면 받아 레이저로 잘라 조립하면 진짜 미니어처 집. 로그인 없이 바로. houscaper.xyz
#미니어처하우스 #레이저커팅 #BGM #DIY #집짓기게임
EN: Every house has its own music 🔊 Gugak for the hanok, koto for the Japanese castle, mariachi for the Mexican village, polka for the German timber house, bebop for New York. Pick a style and its soundtrack plays while you tap to build. Then get the laser-cut drawings, cut, glue, and it is a real miniature house. No sign-up. houscaper.xyz
#miniaturehouse #lasercut #cozygames #diy #soundon
JA: 家ごとに音楽が変わる 🔊 韓屋は国楽、日本の城は箏、メキシコの村はマリアッチ、ドイツの木組みの家はポルカ、ニューヨークはビバップ。スタイルを選ぶと、その家の音楽が流れます。タップで建てて、図面をレーザーで切って組めば本物のミニチュアハウス。登録なしですぐ。houscaper.xyz
#ミニチュアハウス #レーザーカット #BGM #ハンドメイド #箱庭ゲーム
TW: 每種房子都有專屬音樂 🔊 韓屋配國樂、日本城配日本箏、墨西哥小鎮配街頭樂隊、德國木屋配波卡、紐約配咆勃爵士。選好風格，專屬音樂就響起。點一點蓋好，拿圖紙用雷射切割、組起來就是真的微縮屋。免註冊，立即開始。houscaper.xyz
#微縮模型 #雷射切割 #BGM #手作 #療癒遊戲

## Shorts 제목
KO 집마다 음악이 바뀌는 미니어처 집 짓기 #shorts / EN Every house has its own music #shorts / JA 家ごとに音楽が変わるミニチュアハウス #shorts / TW 每種房子都有專屬音樂 #shorts

## 게시 (11/17 ~14:40 KST, 사용자 "올려", 광고 없음)
IG: KO https://www.instagram.com/reel/Df1MqQikRF9/ · EN https://www.instagram.com/reel/Df1MqTXDtow/ · JA https://www.instagram.com/reel/Df1MqbRGyEd/ · TW https://www.instagram.com/reel/Df1MrfoHDW5/
YouTube(공개): KO https://youtu.be/BmcFyBavrgU · EN https://youtu.be/gMR_f1qJBCU · JA https://youtu.be/je-My_W_uUQ · TW https://youtu.be/SJz4HdSgeds
