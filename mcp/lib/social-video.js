// 영상 게시: 공개 Blob 저장(upload_video_from_url), 인스타그램 릴스(post_reel/publish_reel), 유튜브(upload_youtube_video).
import { put } from "@vercel/blob";
import { BRAND_ENV, BRAND_NAME, env, fetchBytes, looksLikeMp4, needBrand, needEnv, readJson, UserError } from "./util.js";

export async function uploadVideoFromUrl({ source_url, name }) {
  const token = env("REELS_READ_WRITE_TOKEN");
  if (!token) throw new UserError("공개 영상 저장소가 연결되지 않았습니다(REELS_READ_WRITE_TOKEN). Vercel에서 ad-monitor-reels-public 저장소를 이 프로젝트에 연결하세요(접두사 REELS).");
  const v = await fetchBytes(source_url);
  if (!looksLikeMp4(v.bytes)) throw new UserError("MP4 영상이 아닌 것 같습니다. MP4 파일 주소를 주세요.");
  const base = String(name || v.name || "video").replace(/\.mp4$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "video";
  const blob = await put(`reels/${base}.mp4`, v.bytes, { access: "public", contentType: "video/mp4", addRandomSuffix: true, token });
  return `올렸습니다(${Math.round(v.bytes.length / 1048576)}MB).\n공개 주소: ${blob.url}\npost_reel의 video_url에 넣으면 됩니다.`;
}

// 인스타그램 토큰이 'IG…'(인스타그램 로그인)이면 graph.instagram.com, 아니면(페이스북 로그인) graph.facebook.com.
function ig(brand) {
  needBrand(brand);
  const k = BRAND_ENV[brand];
  needEnv([`IG_TOKEN_${k}`, `IG_USER_ID_${k}`], `${BRAND_NAME[brand]} 인스타그램`);
  const token = env(`IG_TOKEN_${k}`);
  const host = token.startsWith("IG") ? "https://graph.instagram.com/v21.0" : "https://graph.facebook.com/v21.0";
  return { token, user: env(`IG_USER_ID_${k}`), host };
}

function igError(j, status) {
  const e = j?.error;
  if (!e) return `HTTP ${status}`;
  if (e.code === 190) return "인스타그램 토큰이 만료됐거나 취소됐습니다. 새 토큰을 넣어 주세요.";
  return `${e.message ?? "오류"}${e.code ? ` (코드 ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : ""}`;
}

export async function postReel({ brand, video_url, caption }) {
  const { token, user, host } = ig(brand);
  if (!/^https:\/\//.test(String(video_url || ""))) throw new UserError("video_url은 공개 https MP4 주소여야 합니다(upload_video_from_url로 만들 수 있습니다).");
  const body = new URLSearchParams({ media_type: "REELS", video_url, access_token: token, share_to_feed: "true" });
  if (caption) body.set("caption", String(caption).slice(0, 2200));
  const r = await fetch(`${host}/${user}/media`, { method: "POST", body });
  const j = await readJson(r);
  if (!r.ok || !j.id) throw new UserError(`릴스 업로드 시작 실패: ${igError(j, r.status)}`);
  return `업로드를 시작했습니다. container_id: ${j.id}\n인스타그램이 영상을 처리하는 데 보통 30초~몇 분 걸립니다. publish_reel(brand="${brand}", container_id="${j.id}")로 게시하세요.`;
}

export async function publishReel({ brand, container_id }) {
  const { token, user, host } = ig(brand);
  if (!/^\d+$/.test(String(container_id || ""))) throw new UserError("container_id가 올바르지 않습니다.");
  const s = await fetch(`${host}/${container_id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
  const sj = await readJson(s);
  if (!s.ok) throw new UserError(`처리 상태 확인 실패: ${igError(sj, s.status)}`);
  if (sj.status_code === "IN_PROGRESS") return "아직 처리 중입니다. 몇 초 뒤 다시 publish_reel을 부르세요.";
  if (sj.status_code === "ERROR" || sj.status_code === "EXPIRED") throw new UserError(`인스타그램이 영상을 처리하지 못했습니다(${sj.status_code}): ${sj.status ?? ""}. 영상 규격(9:16, 3~90초, H.264/AAC)을 확인하세요.`);
  if (sj.status_code === "PUBLISHED") return "이미 게시된 container입니다.";
  const p = await fetch(`${host}/${user}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: container_id, access_token: token }) });
  const pj = await readJson(p);
  if (!p.ok || !pj.id) throw new UserError(`게시 실패: ${igError(pj, p.status)}`);
  const l = await fetch(`${host}/${pj.id}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => null);
  const lj = l ? await readJson(l) : {};
  return `${BRAND_NAME[brand]} 인스타그램에 게시했습니다. media_id: ${pj.id}${lj.permalink ? `\n${lj.permalink}` : ""}`;
}

async function googleAccess(refresh) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_OAUTH_CLIENT_ID"), client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"), refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await readJson(r);
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new UserError("유튜브 업로드 토큰이 만료됐거나 취소됐습니다. 대시보드 연결 탭의 '유튜브 업로드 토큰'으로 새로 받아 주세요.");
    throw new UserError(`구글 토큰 갱신 실패(${j.error ?? r.status}).`);
  }
  return j.access_token;
}

export async function uploadYoutube({ brand, source_url, title, description, privacy }) {
  needBrand(brand);
  const k = BRAND_ENV[brand];
  needEnv(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", `YT_UPLOAD_TOKEN_${k}`], `${BRAND_NAME[brand]} 유튜브 업로드`);
  const t = String(title ?? "").trim();
  if (!t) throw new UserError("title이 비어 있습니다.");
  const privacyStatus = privacy === "public" || privacy === "unlisted" ? privacy : "private";
  const access = await googleAccess(env(`YT_UPLOAD_TOKEN_${k}`));
  const v = await fetchBytes(source_url);
  const meta = {
    snippet: { title: t.slice(0, 100), description: String(description ?? "").slice(0, 5000), categoryId: "22" },
    status: { privacyStatus, selfDeclaredMadeForKids: false },
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": v.type.startsWith("video/") ? v.type : "video/*", "x-upload-content-length": String(v.bytes.length) },
    body: JSON.stringify(meta),
  });
  const loc = init.headers.get("location");
  if (!init.ok || !loc) {
    const j = await readJson(init);
    const reason = j?.error?.errors?.[0]?.reason ?? j?.error?.message ?? init.status;
    if (reason === "quotaExceeded" || reason === "uploadLimitExceeded") throw new UserError("유튜브 업로드 한도를 넘었습니다. 내일 다시 시도하세요.");
    throw new UserError(`유튜브 업로드 시작 실패(${reason}).`);
  }
  const up = await fetch(loc, { method: "PUT", headers: { "content-type": v.type.startsWith("video/") ? v.type : "video/*", "content-length": String(v.bytes.length) }, body: v.bytes });
  const uj = await readJson(up);
  if (!up.ok || !uj.id) throw new UserError(`유튜브 업로드 실패(HTTP ${up.status}${uj?.error?.message ? `: ${uj.error.message}` : ""}).`);
  const locked = uj.status?.privacyStatus && uj.status.privacyStatus !== privacyStatus;
  return `${BRAND_NAME[brand]} 유튜브에 올렸습니다(${uj.status?.privacyStatus ?? privacyStatus}). https://youtu.be/${uj.id}${locked ? "\n요청한 공개 범위와 다릅니다 — 구글 앱 심사 전에는 비공개로 잠길 수 있습니다." : ""}`;
}
