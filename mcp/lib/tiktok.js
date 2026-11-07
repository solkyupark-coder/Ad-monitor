// 틱톡 영상 올리기(Content Posting API).
//  - mode="draft"(기본): 브랜드 틱톡 앱의 받은편지함(초안)으로 보낸다. 사용자가 틱톡 앱에서 캡션·음악을 다듬고 직접 게시한다. 공개되지 않는다.
//  - mode="direct": 바로 게시. confirm=true와 사용자 확인이 필요하다. 틱톡 앱 심사 전에는 '나만 보기(SELF_ONLY)'로만 올라간다.
// 토큰: TIKTOK_UPLOAD_TOKEN_{TOPO|HOUSCAPER} (video.upload video.publish, 대시보드 연결 탭 '틱톡 업로드 토큰'), 앱 키: TIKTOK_CLIENT_KEY/SECRET.
// 영상은 서버가 받아서 직접 올린다(FILE_UPLOAD) — 주소 가져오기(PULL_FROM_URL)는 도메인 소유 인증이 필요해 쓰지 않는다.
import { BRAND_ENV, BRAND_NAME, env, fetchBytes, looksLikeMp4, needBrand, readJson, UserError } from "./util.js";

const API = "https://open.tiktokapis.com/v2";
const MB = 1024 * 1024;

function keys(brand) {
  const k = BRAND_ENV[brand];
  const missing = ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", `TIKTOK_UPLOAD_TOKEN_${k}`].filter((n) => !env(n));
  if (missing.length) throw new UserError(`${BRAND_NAME[brand]} 틱톡 업로드 연결이 아직 안 됐습니다. ad-monitor-mcp 환경변수에 ${missing.join(", ")}를 넣고 재배포하세요(토큰은 대시보드 연결 탭 '틱톡 업로드 토큰').`);
  return env(`TIKTOK_UPLOAD_TOKEN_${k}`);
}

const cache = new Map();
async function token(brand) {
  const refresh = keys(brand);
  const hit = cache.get(refresh);
  if (hit && hit.until > Date.now()) return hit.token;
  const r = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), grant_type: "refresh_token", refresh_token: refresh }),
  });
  const j = await readJson(r);
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new UserError("틱톡 업로드 토큰이 만료됐거나 취소됐습니다. 대시보드 연결 탭에서 새로 받아 주세요.");
    throw new UserError(`틱톡 토큰 갱신 실패(${j.error ?? r.status}${j.error_description ? `: ${j.error_description}` : ""}).`);
  }
  cache.set(refresh, { token: j.access_token, until: Date.now() + ((j.expires_in ?? 86400) - 600) * 1000 });
  return j.access_token;
}

async function post(brand, path, body) {
  const t = await token(brand);
  const r = await fetch(`${API}${path}`, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify(body) });
  const j = await readJson(r);
  const code = j?.error?.code;
  if (!r.ok || (code && code !== "ok")) {
    const msg = j?.error?.message ?? `HTTP ${r.status}`;
    if (code === "spam_risk_too_many_posts" || code === "spam_risk_user_banned_from_posting") throw new UserError(`틱톡이 게시를 막았습니다(${code}): 하루 게시 한도를 넘었거나 계정이 제한됐습니다.`);
    if (code === "unaudited_client_can_only_post_to_private_accounts") throw new UserError("틱톡 앱 심사 전이라 공개 게시가 막혔습니다. privacy_level을 SELF_ONLY로 하거나 mode='draft'로 보내세요.");
    if (code === "scope_not_authorized") throw new UserError("업로드 토큰에 video.upload/video.publish 권한이 없습니다. 개발자 사이트에서 Content Posting API를 앱에 추가하고 토큰을 다시 받으세요.");
    if (code === "access_token_invalid") throw new UserError("틱톡 토큰이 거부됐습니다. 대시보드에서 업로드 토큰을 다시 받으세요.");
    throw new UserError(`틱톡 요청 실패(${code ?? r.status}): ${msg}`);
  }
  return j.data ?? {};
}

// 틱톡 규칙: 조각 5~64MB(마지막 조각은 나머지까지 128MB 이하), 64MB 이하는 한 번에.
function chunking(size) {
  if (size <= 64 * MB) return { chunk: size, count: 1 };
  const chunk = 10 * MB;
  return { chunk, count: Math.floor(size / chunk) };
}

export async function tiktokUploadVideo({ brand, source_url, caption, mode, privacy_level, disable_comment, brand_organic, confirm }) {
  needBrand(brand);
  const m = mode === "direct" ? "direct" : "draft";
  keys(brand);
  let info = null;
  if (m === "direct") {
    info = await post(brand, "/post/publish/creator_info/query/", {});
    const options = info.privacy_level_options ?? [];
    const level = privacy_level || (options.includes("SELF_ONLY") ? "SELF_ONLY" : options[0]);
    if (!options.includes(level)) throw new UserError(`이 계정이 고를 수 있는 공개 범위: ${options.join(", ") || "(없음)"}. privacy_level을 그중 하나로 주세요.`);
    if (confirm !== true) {
      return [
        `[바로 게시 미리보기 · ${BRAND_NAME[brand]} 틱톡 @${info.creator_username ?? "?"}]`,
        `공개 범위: ${level}${level === "PUBLIC_TO_EVERYONE" ? " (모두에게 공개)" : ""} · 최대 길이 ${info.max_video_post_duration_sec ?? "?"}초`,
        `캡션: ${String(caption ?? "").slice(0, 2200)}`,
        `영상: ${source_url}`,
        "아직 올리지 않았습니다. 사용자가 영상·캡션·공개 범위를 확인하면 같은 값에 confirm=true를 넣어 다시 부르세요. 확인 없이 올리려면 mode='draft'(틱톡 앱 초안함)를 쓰세요.",
      ].join("\n");
    }
    privacy_level = level;
  }
  const v = await fetchBytes(source_url);
  if (!looksLikeMp4(v.bytes)) throw new UserError("MP4(또는 MOV) 영상이 아닌 것 같습니다.");
  const size = v.bytes.length;
  const { chunk, count } = chunking(size);
  const source_info = { source: "FILE_UPLOAD", video_size: size, chunk_size: chunk, total_chunk_count: count };
  const init =
    m === "direct"
      ? await post(brand, "/post/publish/video/init/", {
          post_info: {
            title: String(caption ?? "").slice(0, 2200),
            privacy_level,
            disable_comment: !!disable_comment || !!info?.comment_disabled,
            disable_duet: !!info?.duet_disabled,
            disable_stitch: !!info?.stitch_disabled,
            brand_organic_toggle: brand_organic !== false, // 자기 브랜드 홍보 영상임을 표시(틱톡 상업 콘텐츠 공개 규칙)
            brand_content_toggle: false,
          },
          source_info,
        })
      : await post(brand, "/post/publish/inbox/video/init/", { source_info });
  if (!init.upload_url || !init.publish_id) throw new UserError("틱톡이 업로드 주소를 주지 않았습니다.");
  for (let i = 0; i < count; i++) {
    const start = i * chunk;
    const end = i === count - 1 ? size - 1 : start + chunk - 1;
    const part = v.bytes.subarray(start, end + 1);
    const r = await fetch(init.upload_url, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(part.length), "content-range": `bytes ${start}-${end}/${size}` }, body: part });
    if (!r.ok && r.status !== 206 && r.status !== 201) throw new UserError(`틱톡에 영상 조각 ${i + 1}/${count} 올리기 실패(HTTP ${r.status}).`);
  }
  return m === "direct"
    ? `${BRAND_NAME[brand]} 틱톡에 바로 게시를 보냈습니다(${privacy_level}). publish_id: ${init.publish_id}\n틱톡 처리에 보통 1분 안팎 걸립니다. tiktok_post_status로 결과를 확인하세요.`
    : `${BRAND_NAME[brand]} 틱톡 초안함으로 보냈습니다(공개 안 됨). publish_id: ${init.publish_id}\n브랜드 틱톡 앱의 알림(받은편지함)에서 영상을 열어 캡션을 넣고 게시하면 됩니다. 넣을 캡션: ${String(caption ?? "(없음)").slice(0, 300)}`;
}

const STATUS = {
  PROCESSING_UPLOAD: "업로드 처리 중",
  PROCESSING_DOWNLOAD: "영상 받는 중",
  SEND_TO_USER_INBOX: "틱톡 앱 초안함으로 보냄 — 앱에서 게시하세요",
  PUBLISH_COMPLETE: "게시 완료",
  FAILED: "실패",
};

export async function tiktokPostStatus({ brand, publish_id }) {
  needBrand(brand);
  if (!publish_id) throw new UserError("publish_id가 필요합니다.");
  const d = await post(brand, "/post/publish/status/fetch/", { publish_id: String(publish_id) });
  const ids = d.publicaly_available_post_id ?? d.publicly_available_post_id ?? [];
  return [`상태: ${STATUS[d.status] ?? d.status ?? "?"}`, d.fail_reason ? `실패 사유: ${d.fail_reason}` : "", ids.length ? `게시물 ID: ${ids.join(", ")}` : "", d.uploaded_bytes ? `올라간 크기: ${Math.round(d.uploaded_bytes / MB)}MB` : ""].filter(Boolean).join("\n");
}
