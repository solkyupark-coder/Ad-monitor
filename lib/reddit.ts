// 레딧 읽기 전용 조회:
//  1) 브랜드 계정의 글(내가 올린 포스트)·카르마 — {BRAND}_REDDIT_USER_REFRESH_TOKEN (identity history read)
//  2) 레딧 광고 성과(노출·클릭·지출) — {BRAND}_REDDIT_REFRESH_TOKEN (adsread) + {BRAND}_REDDIT_AD_ACCOUNT_ID
// 레딧 API는 글의 조회수(view)를 거의 주지 않는다 — 업보트 점수·댓글·추천 비율로 반응을 본다.
// 토큰 값은 화면·로그에 내지 않는다.
import { redditAccessToken, UA } from "@/lib/reddit-oauth";
import { logFailure } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { offsetMs, type DateRange } from "@/lib/range";

const DAY = 86400000;
const prefixOf = (brand: BrandId) => BRANDS.find((b) => b.id === brand)!.prefix;
const dateOf = (sec: number) => new Date(sec * 1000 + offsetMs()).toISOString().slice(0, 10);

export type RedditPost = {
  title: string;
  subreddit: string;
  date: string;
  score: number;
  comments: number;
  upvoteRatio: number | null;
  views: number | null;
  url: string;
  removed: boolean;
};
export type RedditPeriod = { posts: number; score: number; comments: number };
export type RedditPosts =
  | { ok: true; user: string; karma: number | null; cur: RedditPeriod; prev: RedditPeriod | null; posts: RedditPost[]; recent: RedditPost[]; subreddits: { name: string; posts: number; score: number }[] }
  | { ok: false; reason: string; reconnect: boolean };
export type RedditAdsDay = { date: string; impressions: number; clicks: number; spend: number };
export type RedditAds =
  | { ok: true; currency: string; spend: number; impressions: number; clicks: number; days: RedditAdsDay[] }
  | { ok: false; reason: string; reconnect: boolean };
export type RedditSummary = { posts: RedditPosts | null; ads: RedditAds | null };

type Child = {
  data: {
    title?: string;
    subreddit?: string;
    created_utc?: number;
    score?: number;
    num_comments?: number;
    upvote_ratio?: number;
    view_count?: number | null;
    permalink?: string;
    removed_by_category?: string | null;
  };
};

function tokenFail(error: string, envName: string): { ok: false; reason: string; reconnect: boolean } {
  if (error === "invalid_grant") return { ok: false, reason: `레딧 토큰이 취소됐거나 만료됐습니다 — '레딧 다시 연결'로 새로 받아 ${envName}에 넣으세요`, reconnect: true };
  if (error === "http_401" || error === "invalid_client") return { ok: false, reason: "레딧 앱 ID·secret이 맞지 않습니다 — 토큰을 발급한 앱과 같은 앱 값인지 확인하세요", reconnect: false };
  return { ok: false, reason: `레딧 토큰 갱신 실패 (${error})`, reconnect: false };
}

async function oauthGet<T>(path: string, token: string): Promise<{ ok: true; v: T } | { ok: false; status: number }> {
  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { authorization: `Bearer ${token}`, "user-agent": UA },
    next: { revalidate: 600 },
  }).catch(() => null);
  if (!res) return { ok: false, status: 0 };
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, v: (await res.json()) as T };
}

const toPost = (c: Child): RedditPost => ({
  title: c.data.title ?? "",
  subreddit: c.data.subreddit ?? "",
  date: dateOf(c.data.created_utc ?? 0),
  score: c.data.score ?? 0,
  comments: c.data.num_comments ?? 0,
  upvoteRatio: typeof c.data.upvote_ratio === "number" ? c.data.upvote_ratio : null,
  views: typeof c.data.view_count === "number" ? c.data.view_count : null,
  url: c.data.permalink ? `https://www.reddit.com${c.data.permalink}` : "",
  removed: !!c.data.removed_by_category,
});

const periodOf = (ps: RedditPost[]): RedditPeriod => ({ posts: ps.length, score: ps.reduce((a, p) => a + p.score, 0), comments: ps.reduce((a, p) => a + p.comments, 0) });

export async function redditPosts(brand: BrandId, range: DateRange): Promise<RedditPosts> {
  const envName = `${prefixOf(brand)}_REDDIT_USER_REFRESH_TOKEN`;
  const refresh = process.env[envName];
  if (!refresh) return { ok: false, reason: "레딧 글 읽기 토큰이 없습니다", reconnect: true };
  const t = await redditAccessToken(brand, refresh);
  if (!t.ok) {
    logFailure("reddit", brand, `token ${t.error}`);
    return tokenFail(t.error, envName);
  }
  const me = await oauthGet<{ name?: string; total_karma?: number; link_karma?: number; comment_karma?: number }>("/api/v1/me", t.token);
  if (!me.ok) return { ok: false, reason: `레딧 계정 조회 실패 (HTTP ${me.status}) — identity 권한으로 다시 연결하세요`, reconnect: me.status === 401 || me.status === 403 };
  const user = me.v.name ?? "";
  // 최근 글 최대 100개(레딧 한 번 호출 한도). 기간 비교에 충분하다.
  const sub = await oauthGet<{ data?: { children?: Child[] } }>(`/user/${encodeURIComponent(user)}/submitted?limit=100&sort=new&raw_json=1`, t.token);
  if (!sub.ok) {
    logFailure("reddit", brand, `submitted ${sub.status}`);
    return { ok: false, reason: `레딧 글 목록 조회 실패 (HTTP ${sub.status}) — history 권한으로 다시 연결하세요`, reconnect: sub.status === 401 || sub.status === 403 };
  }
  const all = (sub.v.data?.children ?? []).map(toPost);
  const inRange = (p: RedditPost, from: string, to: string) => p.date >= from && p.date <= to;
  const cur = all.filter((p) => inRange(p, range.from, range.to));
  const prev = range.today ? null : all.filter((p) => inRange(p, range.prev.from, range.prev.to));
  const subs = new Map<string, { posts: number; score: number }>();
  for (const p of cur) {
    const s = subs.get(p.subreddit) ?? { posts: 0, score: 0 };
    s.posts += 1;
    s.score += p.score;
    subs.set(p.subreddit, s);
  }
  return {
    ok: true,
    user,
    karma: me.v.total_karma ?? (me.v.link_karma ?? 0) + (me.v.comment_karma ?? 0),
    cur: periodOf(cur),
    prev: prev ? periodOf(prev) : null,
    posts: [...cur].sort((a, b) => b.score - a.score || b.comments - a.comments).slice(0, 10),
    recent: all.slice(0, 5),
    subreddits: [...subs].map(([name, s]) => ({ name, ...s })).sort((a, b) => b.score - a.score),
  };
}

// 레딧 광고 API v3 보고서. 응답 모양이 버전마다 조금 달라 키를 넉넉히 받는다. 지출은 마이크로 단위(÷1,000,000).
export async function redditAds(brand: BrandId, range: DateRange): Promise<RedditAds> {
  const prefix = prefixOf(brand);
  const envName = `${prefix}_REDDIT_REFRESH_TOKEN`;
  const refresh = process.env[envName];
  const account = (process.env[`${prefix}_REDDIT_AD_ACCOUNT_ID`] ?? "").trim();
  if (!refresh || !account) return { ok: false, reason: "레딧 광고 자격증명이 없습니다", reconnect: !refresh };
  const t = await redditAccessToken(brand, refresh);
  if (!t.ok) {
    logFailure("reddit-ads", brand, `token ${t.error}`);
    return tokenFail(t.error, envName);
  }
  const startMs = Date.parse(`${range.from}T00:00:00Z`) - offsetMs();
  const endMs = Math.min(Date.parse(`${range.to}T00:00:00Z`) - offsetMs() + DAY, Math.floor(Date.now() / 3600000) * 3600000);
  const body = {
    data: {
      starts_at: new Date(startMs).toISOString().replace(/\.\d{3}Z$/, "Z"),
      ends_at: new Date(endMs).toISOString().replace(/\.\d{3}Z$/, "Z"),
      breakdowns: ["DATE"],
      fields: ["IMPRESSIONS", "CLICKS", "SPEND"],
      time_zone_id: "Asia/Seoul",
    },
  };
  const res = await fetch(`https://ads-api.reddit.com/api/v3/ad_accounts/${encodeURIComponent(account)}/reports`, {
    method: "POST",
    headers: { authorization: `Bearer ${t.token}`, "user-agent": UA, "content-type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 600 },
  }).catch(() => null);
  if (!res) return { ok: false, reason: "레딧 광고 조회 실패(네트워크)", reconnect: false };
  if (!res.ok) {
    const txt = (await res.text().catch(() => "")).slice(0, 160);
    logFailure("reddit-ads", brand, `report ${res.status} ${txt}`);
    if (res.status === 401 || res.status === 403) return { ok: false, reason: `레딧 광고 접근 권한이 없습니다 (HTTP ${res.status}) — 광고 계정 ID와 adsread 권한, 광고 API 접근 승인을 확인하세요`, reconnect: res.status === 401 };
    return { ok: false, reason: `레딧 광고 조회 실패 (HTTP ${res.status})`, reconnect: false };
  }
  type Row = Record<string, unknown>;
  const j = (await res.json().catch(() => ({}))) as { data?: { metrics?: Row[]; currency?: string } | Row[] };
  const rows: Row[] = Array.isArray(j.data) ? j.data : (j.data?.metrics ?? []);
  const num = (r: Row, k: string) => Number(r[k] ?? r[k.toUpperCase()] ?? 0) || 0;
  const days: RedditAdsDay[] = rows
    .map((r) => ({
      date: String(r.date ?? r.DATE ?? "").slice(0, 10),
      impressions: num(r, "impressions"),
      clicks: num(r, "clicks"),
      spend: num(r, "spend") / 1_000_000,
    }))
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    ok: true,
    currency: (!Array.isArray(j.data) && j.data?.currency) || "USD",
    spend: days.reduce((a, d) => a + d.spend, 0),
    impressions: days.reduce((a, d) => a + d.impressions, 0),
    clicks: days.reduce((a, d) => a + d.clicks, 0),
    days,
  };
}

export async function redditSummary(brand: BrandId, range: DateRange, on: { posts: boolean; ads: boolean }): Promise<RedditSummary | null> {
  if (!on.posts && !on.ads) return null;
  const [posts, ads] = await Promise.all([on.posts ? redditPosts(brand, range) : null, on.ads ? redditAds(brand, range) : null]);
  return { posts, ads };
}
