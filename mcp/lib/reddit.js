// 레딧: 서브레딧 규칙 확인, 내 글 반응 보기, 글 올리기.
// 레딧에는 '초안' API가 없다. 그래서 reddit_submit_post는 confirm=true가 아니면 실제로 올리지 않고 미리보기·규칙 점검만 돌려준다.
// 토큰: REDDIT_POST_TOKEN_{TOPO|HOUSCAPER} (identity submit read flair, 대시보드 연결 탭의 '레딧 글쓰기 토큰'으로 발급)
// 앱: REDDIT_CLIENT_ID_{TOPO|HOUSCAPER}/SECRET_… 이 있으면 그것, 없으면 REDDIT_CLIENT_ID/SECRET.
import { BRAND_ENV, BRAND_NAME, env, needBrand, readJson, UserError } from "./util.js";

const UA = "web:ad-monitor-mcp:0.3 (brand posting)";

function client(brand) {
  const k = BRAND_ENV[brand];
  const id = env(`REDDIT_CLIENT_ID_${k}`) ?? env("REDDIT_CLIENT_ID");
  const secret = env(`REDDIT_CLIENT_SECRET_${k}`) ?? env("REDDIT_CLIENT_SECRET");
  const refresh = env(`REDDIT_POST_TOKEN_${k}`);
  const missing = [!id && "REDDIT_CLIENT_ID", !secret && "REDDIT_CLIENT_SECRET", !refresh && `REDDIT_POST_TOKEN_${k}`].filter(Boolean);
  if (missing.length) throw new UserError(`${BRAND_NAME[brand]} 레딧 글쓰기 연결이 아직 안 됐습니다. ad-monitor-mcp 환경변수에 ${missing.join(", ")}를 넣고 재배포하세요(토큰은 대시보드 연결 탭 '레딧 글쓰기 토큰').`);
  return { id, secret, refresh };
}

const cache = new Map();
async function token(brand) {
  const c = client(brand);
  const hit = cache.get(c.refresh);
  if (hit && hit.until > Date.now()) return hit.token;
  const r = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.refresh }),
  });
  const j = await readJson(r);
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new UserError("레딧 글쓰기 토큰이 취소됐거나 만료됐습니다. 대시보드 연결 탭에서 새로 받아 주세요.");
    if (r.status === 401) throw new UserError("레딧 앱 ID·secret이 토큰을 발급한 앱과 다릅니다.");
    throw new UserError(`레딧 토큰 갱신 실패(${j.error ?? r.status}).`);
  }
  cache.set(c.refresh, { token: j.access_token, until: Date.now() + ((j.expires_in ?? 3600) - 300) * 1000 });
  return j.access_token;
}

async function api(brand, path, init = {}) {
  const t = await token(brand);
  const r = await fetch(`https://oauth.reddit.com${path}`, { ...init, headers: { authorization: `Bearer ${t}`, "user-agent": UA, ...(init.headers ?? {}) } });
  return { r, j: await readJson(r) };
}

const subName = (s) => String(s ?? "").trim().replace(/^\/?r\//i, "").replace(/\/+$/, "");

async function subredditInfo(brand, sr) {
  const [about, rules, req, flairs] = await Promise.all([
    api(brand, `/r/${encodeURIComponent(sr)}/about?raw_json=1`),
    api(brand, `/r/${encodeURIComponent(sr)}/about/rules?raw_json=1`),
    api(brand, `/api/v1/${encodeURIComponent(sr)}/post_requirements`),
    api(brand, `/r/${encodeURIComponent(sr)}/api/link_flair_v2`),
  ]);
  if (about.r.status === 404 || about.j?.kind !== "t5") throw new UserError(`r/${sr}을 찾지 못했습니다(없거나 비공개·차단).`);
  const a = about.j.data ?? {};
  return {
    name: a.display_name ?? sr,
    subscribers: a.subscribers ?? null,
    type: a.subreddit_type,
    submissionType: a.submission_type, // any | link | self
    allowImages: a.allow_images,
    rules: (rules.j?.rules ?? []).map((x) => `${x.short_name}${x.description ? ` — ${String(x.description).replace(/\s+/g, " ").slice(0, 160)}` : ""}`),
    requirements: req.r.ok ? req.j : null,
    flairs: flairs.r.ok && Array.isArray(flairs.j) ? flairs.j.map((f) => ({ id: f.id, text: f.text, modOnly: !!f.mod_only })).filter((f) => !f.modOnly) : [],
  };
}

function describe(info) {
  const L = [`r/${info.name} · 구독자 ${info.subscribers?.toLocaleString("en-US") ?? "?"} · 허용 글 종류: ${{ any: "글·링크 모두", link: "링크만", self: "글(텍스트)만" }[info.submissionType] ?? info.submissionType ?? "?"}`];
  const q = info.requirements;
  if (q) {
    if (q.is_flair_required) L.push("⚠ 플레어(분류 태그) 필수 — flair_id를 골라야 합니다.");
    if (q.title_text_min_length || q.title_text_max_length) L.push(`제목 길이: ${q.title_text_min_length ?? 0}~${q.title_text_max_length ?? 300}자`);
    if (q.body_restriction_policy && q.body_restriction_policy !== "none") L.push(`본문 규칙: ${q.body_restriction_policy}`);
    if (q.domain_blacklist?.length) L.push(`금지 링크 도메인: ${q.domain_blacklist.join(", ")}`);
    if (q.title_blacklisted_strings?.length) L.push(`제목 금지어: ${q.title_blacklisted_strings.join(", ")}`);
    if (q.body_blacklisted_strings?.length) L.push(`본문 금지어: ${q.body_blacklisted_strings.join(", ")}`);
    if (q.title_required_strings?.length) L.push(`제목 필수어: ${q.title_required_strings.join(", ")}`);
  }
  if (info.flairs.length) L.push(`플레어: ${info.flairs.map((f) => `${f.text} (${f.id})`).join(" | ")}`);
  if (info.rules.length) L.push(`규칙:\n${info.rules.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}`);
  return L.join("\n");
}

export async function redditCheckSubreddit({ brand, subreddit }) {
  needBrand(brand);
  const sr = subName(subreddit);
  if (!sr) throw new UserError("subreddit을 주세요(예: lasercutting).");
  return describe(await subredditInfo(brand, sr));
}

export async function redditSubmitPost({ brand, subreddit, title, text, url, flair_id, nsfw, confirm }) {
  needBrand(brand);
  const sr = subName(subreddit);
  const t = String(title ?? "").trim();
  if (!sr || !t) throw new UserError("subreddit과 title이 필요합니다.");
  if (t.length > 300) throw new UserError("레딧 제목은 300자까지입니다.");
  const kind = url ? "link" : "self";
  if (url && !/^https?:\/\//.test(url)) throw new UserError("url은 http(s) 주소여야 합니다.");
  const info = await subredditInfo(brand, sr);
  const problems = [];
  if (info.submissionType === "link" && kind === "self") problems.push("이 서브레딧은 링크 글만 받습니다.");
  if (info.submissionType === "self" && kind === "link") problems.push("이 서브레딧은 텍스트 글만 받습니다(링크는 본문에 넣으세요).");
  const q = info.requirements ?? {};
  if (q.is_flair_required && !flair_id) problems.push("플레어가 필수입니다. flair_id를 고르세요.");
  if (flair_id && info.flairs.length && !info.flairs.some((f) => f.id === flair_id)) problems.push("flair_id가 이 서브레딧 목록에 없습니다.");
  if (q.title_text_min_length && t.length < q.title_text_min_length) problems.push(`제목이 너무 짧습니다(최소 ${q.title_text_min_length}자).`);
  if (q.title_text_max_length && t.length > q.title_text_max_length) problems.push(`제목이 너무 깁니다(최대 ${q.title_text_max_length}자).`);
  if (url && q.domain_blacklist?.some((d) => new URL(url).hostname.endsWith(d))) problems.push("링크 도메인이 금지 목록에 있습니다.");
  const preview = [
    `[미리보기 · ${BRAND_NAME[brand]} 계정 → r/${info.name}]`,
    `종류: ${kind === "link" ? "링크" : "텍스트"}${flair_id ? ` · 플레어 ${info.flairs.find((f) => f.id === flair_id)?.text ?? flair_id}` : ""}${nsfw ? " · NSFW" : ""}`,
    `제목: ${t}`,
    kind === "link" ? `링크: ${url}` : `본문:\n${String(text ?? "").slice(0, 1500)}${String(text ?? "").length > 1500 ? "…" : ""}`,
  ].join("\n");
  if (problems.length) return `${preview}\n\n올릴 수 없습니다:\n- ${problems.join("\n- ")}\n\n${describe(info)}`;
  if (confirm !== true) return `${preview}\n\n아직 올리지 않았습니다(레딧은 초안 기능이 없음). 사용자가 이 내용과 서브레딧을 확인하면 같은 값에 confirm=true를 넣어 다시 부르세요.\n\n${describe(info)}`;
  const body = new URLSearchParams({ sr: info.name, kind, title: t, api_type: "json", resubmit: "true", sendreplies: "true", nsfw: nsfw ? "true" : "false" });
  if (kind === "link") body.set("url", url);
  else body.set("text", String(text ?? ""));
  if (flair_id) body.set("flair_id", flair_id);
  const { r, j } = await api(brand, "/api/submit", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const errs = j?.json?.errors ?? [];
  if (!r.ok || errs.length) {
    const e = errs.map((x) => x.join(": ")).join(" / ") || `HTTP ${r.status}`;
    if (/RATELIMIT/i.test(e)) throw new UserError(`레딧이 잠시 글쓰기를 막았습니다(새 계정·카르마 낮음): ${e}`);
    throw new UserError(`레딧 글 올리기 실패: ${e}`);
  }
  const d = j?.json?.data ?? {};
  return `${BRAND_NAME[brand]} 계정으로 r/${info.name}에 올렸습니다.\n${d.url ?? ""}${d.id ? `\n글 ID: ${d.name ?? d.id}` : ""}\n서브레딧 자동 필터에 걸리면 바로 안 보일 수 있습니다 — 몇 분 뒤 reddit_my_posts로 점수·삭제 여부를 확인하세요.`;
}

export async function redditMyPosts({ brand, limit }) {
  needBrand(brand);
  const me = await api(brand, "/api/v1/me");
  if (!me.r.ok) throw new UserError(`레딧 계정 조회 실패(HTTP ${me.r.status}).`);
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const { r, j } = await api(brand, `/user/${encodeURIComponent(me.j.name)}/submitted?limit=${n}&sort=new&raw_json=1`);
  if (!r.ok) throw new UserError(`글 목록 조회 실패(HTTP ${r.status}).`);
  const rows = (j?.data?.children ?? []).map((c) => c.data);
  if (!rows.length) return `u/${me.j.name}: 올린 글이 없습니다.`;
  return [`u/${me.j.name} · 카르마 ${me.j.total_karma ?? "?"}`, ...rows.map((p) => `- ${new Date(p.created_utc * 1000).toISOString().slice(0, 10)} r/${p.subreddit} ▲${p.score} 💬${p.num_comments}${p.removed_by_category ? ` (삭제됨: ${p.removed_by_category})` : ""} — ${p.title}\n  https://www.reddit.com${p.permalink}`)].join("\n");
}
