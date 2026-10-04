#!/usr/bin/env node
// 인스타그램 릴스 게시 도구 (대시보드와 분리된 명령줄 도구).
// 기본은 미리보기(dry-run)이고, --yes 를 붙여야 실제로 게시한다. 토큰은 화면·로그에 출력하지 않는다.
//
// 사용법:
//   node scripts/publish-reel.mjs --brand houscaper --video-url https://… --caption "문구" [--no-feed] [--yes]
//
// 필요한 환경변수(프로젝트 폴더의 .env.publish 또는 셸 환경변수. .env.publish 는 git에 올라가지 않는다):
//   HOUSCAPER_IG_USER_ID / HOUSCAPER_IG_PUBLISH_TOKEN
//   TOPOGENESIS_IG_USER_ID / TOPOGENESIS_IG_PUBLISH_TOKEN
//   GRAPH_BASE (선택, 테스트용. 기본 https://graph.facebook.com/v21.0)
import { existsSync, readFileSync } from "node:fs";

const BRANDS = { houscaper: "HOUSCAPER", topogenesis: "TOPOGENESIS" };
const GRAPH = process.env.GRAPH_BASE || "https://graph.facebook.com/v21.0";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function parseArgs(argv) {
  const out = { feed: true, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") out.yes = true;
    else if (a === "--no-feed") out.feed = false;
    else if (a === "--brand") out.brand = argv[++i];
    else if (a === "--video-url") out.videoUrl = argv[++i];
    else if (a === "--caption") out.caption = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else fail(`알 수 없는 옵션: ${a}`);
  }
  return out;
}

function fail(msg) {
  console.error(`오류: ${msg}`);
  process.exit(1);
}

async function graph(path, { method = "GET", body, token }) {
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? new URLSearchParams(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error || {};
    // 토큰이 담길 수 있는 요청 내용은 출력하지 않고, 오류 코드와 메시지만 보여 준다.
    fail(`Graph API ${res.status} (코드 ${e.code ?? "?"}${e.error_subcode ? `/${e.error_subcode}` : ""}): ${e.message ?? "알 수 없는 오류"}`);
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  loadEnvFile(".env.publish");
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.brand) {
    console.log("사용법: node scripts/publish-reel.mjs --brand houscaper|topogenesis --video-url https://… --caption \"문구\" [--no-feed] [--yes]");
    process.exit(args.help ? 0 : 1);
  }
  const prefix = BRANDS[args.brand];
  if (!prefix) fail(`brand는 ${Object.keys(BRANDS).join(" 또는 ")} 중 하나여야 합니다.`);
  if (!args.videoUrl || !/^https:\/\//.test(args.videoUrl)) fail("--video-url 은 https:// 로 시작하는 공개 주소여야 합니다.");
  const caption = args.caption ?? "";
  if (caption.length > 2200) fail(`캡션이 ${caption.length}자입니다. 최대 2,200자입니다.`);
  const hashtags = (caption.match(/#[^\s#]+/g) || []).length;
  if (hashtags > 30) fail(`해시태그가 ${hashtags}개입니다. 최대 30개입니다.`);

  const userId = process.env[`${prefix}_IG_USER_ID`];
  const token = process.env[`${prefix}_IG_PUBLISH_TOKEN`];
  const missing = [!userId && `${prefix}_IG_USER_ID`, !token && `${prefix}_IG_PUBLISH_TOKEN`].filter(Boolean);
  if (missing.length) fail(`환경변수가 없습니다: ${missing.join(", ")}`);

  console.log("── 게시 미리보기 ─────────────────");
  console.log(`브랜드      : ${args.brand}`);
  console.log(`영상 주소   : ${args.videoUrl}`);
  console.log(`피드에도 노출: ${args.feed ? "예" : "아니오"}`);
  console.log(`캡션(${caption.length}자): ${caption || "(없음)"}`);
  console.log("──────────────────────────────────");
  if (!args.yes) {
    console.log("미리보기입니다. 실제로 게시하려면 같은 명령 끝에 --yes 를 붙이세요. 아무것도 게시되지 않았습니다.");
    return;
  }

  // 1) 미디어 컨테이너 생성
  const created = await graph(`/${userId}/media`, {
    method: "POST",
    token,
    body: { media_type: "REELS", video_url: args.videoUrl, caption, share_to_feed: String(args.feed) },
  });
  console.log("컨테이너 생성 완료. 영상 처리 대기 중…");

  // 2) 처리 완료까지 대기 (최대 5분)
  for (let i = 0; i < 60; i++) {
    const s = await graph(`/${created.id}?fields=status_code,status`, { token });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") fail(`영상 처리 실패: ${s.status_code}${s.status ? ` — ${s.status}` : ""}`);
    if (i === 59) fail("영상 처리가 5분 안에 끝나지 않았습니다. 잠시 뒤 다시 시도하세요.");
    await sleep(5000);
  }

  // 3) 게시
  const published = await graph(`/${userId}/media_publish`, { method: "POST", token, body: { creation_id: created.id } });
  const info = await graph(`/${published.id}?fields=permalink`, { token }).catch(() => ({}));
  console.log(`게시 완료: ${info.permalink ?? `미디어 ID ${published.id}`}`);
}

main().catch((e) => fail(e?.message ?? String(e)));
