// 틱톡 읽기 전용 조회(Display API v2): 계정 현황(팔로워·좋아요·영상 수)과 최근 영상별 조회·좋아요·댓글·공유.
// 틱톡은 영상별 '누적' 수치만 준다(날짜별 조회 기록 없음) — 기간 숫자는 '그 기간에 올린 영상의 지금까지 누적'이다.
// 토큰 값은 화면·로그에 내지 않는다.
import { tiktokToken } from "@/lib/tiktok-oauth";
import { logFailure } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { offsetMs, type DateRange } from "@/lib/range";

const API = "https://open.tiktokapis.com/v2";
const MAX_VIDEOS = 100; // 20개씩 최대 5페이지
const prefixOf = (brand: BrandId) => BRANDS.find((b) => b.id === brand)!.prefix;
const dateOf = (sec: number) => new Date(sec * 1000 + offsetMs()).toISOString().slice(0, 10);

export type TiktokVideo = { id: string; title: string; date: string; views: number; likes: number; comments: number; shares: number; url: string | null; cover: string | null };
export type TiktokPeriod = { videos: number; views: number; likes: number; comments: number; shares: number };
export type TiktokSummary =
  | {
      ok: true;
      name: string;
      username: string | null;
      followers: number | null;
      likesTotal: number | null;
      videoCount: number | null;
      cur: TiktokPeriod;
      prev: TiktokPeriod | null;
      videos: TiktokVideo[]; // 기간에 올린 영상(조회 많은 순)
      recent: TiktokVideo[]; // 가장 최근 영상 5개(기간 밖이어도)
      truncated: boolean;
    }
  | { ok: false; reason: string; reconnect: boolean };

type ApiErr = { error?: { code?: string; message?: string } };
type UserInfo = ApiErr & { data?: { user?: { display_name?: string; username?: string; follower_count?: number; likes_count?: number; video_count?: number } } };
type VideoRow = { id?: string; title?: string; video_description?: string; create_time?: number; view_count?: number; like_count?: number; comment_count?: number; share_count?: number; share_url?: string; cover_image_url?: string };
type VideoList = ApiErr & { data?: { videos?: VideoRow[]; cursor?: number; has_more?: boolean } };

function failure(code: string, status: number): { ok: false; reason: string; reconnect: boolean } {
  if (code === "access_token_invalid" || status === 401) return { ok: false, reason: "틱톡 접근 권한이 없습니다 — 토큰이 만료됐거나 취소됐습니다. '틱톡 다시 연결'로 새로 받으세요", reconnect: true };
  if (code === "scope_not_authorized" || code === "scope_permission_missed") return { ok: false, reason: "틱톡 앱에 필요한 권한(user.info.stats, video.list)이 승인되지 않았습니다 — 개발자 사이트에서 앱에 해당 스코프를 추가하고 다시 연결하세요", reconnect: true };
  if (code === "rate_limit_exceeded" || status === 429) return { ok: false, reason: "틱톡 호출 한도를 넘었습니다 — 잠시 뒤 다시 보세요", reconnect: false };
  return { ok: false, reason: `틱톡 조회 실패 (${code || `HTTP ${status}`})`, reconnect: false };
}

const period = (vs: TiktokVideo[]): TiktokPeriod => ({
  videos: vs.length,
  views: vs.reduce((a, v) => a + v.views, 0),
  likes: vs.reduce((a, v) => a + v.likes, 0),
  comments: vs.reduce((a, v) => a + v.comments, 0),
  shares: vs.reduce((a, v) => a + v.shares, 0),
});

export async function tiktokSummary(brand: BrandId, range: DateRange): Promise<TiktokSummary> {
  const envName = `${prefixOf(brand)}_TIKTOK_REFRESH_TOKEN`;
  const refresh = process.env[envName];
  if (!refresh) return { ok: false, reason: "틱톡 자격증명이 없습니다", reconnect: true };
  const t = await tiktokToken(refresh);
  if (!t.ok) {
    logFailure("tiktok", brand, `token ${t.error}`);
    return t.error === "invalid_grant"
      ? { ok: false, reason: `틱톡 refresh token이 만료됐거나 취소됐습니다(발급 후 1년) — '틱톡 다시 연결'로 새로 받아 ${envName}에 넣으세요`, reconnect: true }
      : { ok: false, reason: `틱톡 토큰 갱신 실패 (${t.error}) — TIKTOK_CLIENT_KEY·SECRET이 연결할 때 쓴 앱과 같은지 확인하세요`, reconnect: false };
  }
  const h = { authorization: `Bearer ${t.token}` };
  const uRes = await fetch(`${API}/user/info/?fields=display_name,username,follower_count,likes_count,video_count`, { headers: h, next: { revalidate: 600 } }).catch(() => null);
  if (!uRes) return { ok: false, reason: "틱톡 조회 실패(네트워크)", reconnect: false };
  const u = (await uRes.json().catch(() => ({}))) as UserInfo;
  if (!uRes.ok || (u.error?.code && u.error.code !== "ok")) return failure(u.error?.code ?? "", uRes.status);
  const fields = "id,title,video_description,create_time,view_count,like_count,comment_count,share_count,share_url,cover_image_url";
  const rows: VideoRow[] = [];
  let cursor: number | undefined;
  let truncated = false;
  const oldest = Date.parse(`${range.today ? range.from : range.prev.from}T00:00:00Z`) / 1000 - 86400;
  for (;;) {
    const r = await fetch(`${API}/video/list/?fields=${fields}`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify(cursor ? { max_count: 20, cursor } : { max_count: 20 }),
      next: { revalidate: 600 },
    }).catch(() => null);
    if (!r) break;
    const j = (await r.json().catch(() => ({}))) as VideoList;
    if (!r.ok || (j.error?.code && j.error.code !== "ok")) {
      if (!rows.length) return failure(j.error?.code ?? "", r.status);
      break;
    }
    const vs = j.data?.videos ?? [];
    rows.push(...vs);
    const last = vs[vs.length - 1]?.create_time ?? 0;
    if (!j.data?.has_more || !vs.length || last < oldest) break;
    if (rows.length >= MAX_VIDEOS) {
      truncated = true;
      break;
    }
    cursor = j.data.cursor;
  }
  const videos: TiktokVideo[] = rows.map((v) => ({
    id: v.id ?? "",
    title: (v.title || v.video_description || "(제목 없음)").slice(0, 120),
    date: dateOf(v.create_time ?? 0),
    views: v.view_count ?? 0,
    likes: v.like_count ?? 0,
    comments: v.comment_count ?? 0,
    shares: v.share_count ?? 0,
    url: v.share_url ?? null,
    cover: v.cover_image_url ?? null,
  }));
  const within = (v: TiktokVideo, from: string, to: string) => v.date >= from && v.date <= to;
  const cur = videos.filter((v) => within(v, range.from, range.to));
  const prev = range.today ? null : videos.filter((v) => within(v, range.prev.from, range.prev.to));
  const user = u.data?.user ?? {};
  return {
    ok: true,
    name: user.display_name ?? "",
    username: user.username ?? null,
    followers: user.follower_count ?? null,
    likesTotal: user.likes_count ?? null,
    videoCount: user.video_count ?? null,
    cur: period(cur),
    prev: prev ? period(prev) : null,
    videos: [...cur].sort((a, b) => b.views - a.views).slice(0, 10),
    recent: videos.slice(0, 5),
    truncated,
  };
}
