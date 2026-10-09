// 유튜브 읽기 전용 조회. 채널 현황은 YouTube Data API v3(youtube.readonly), 기간별 지표는 YouTube Analytics API v2(yt-analytics.readonly).
// 자격증명/토큰 값은 화면·로그에 내지 않는다.
import { googleToken, logFailure, tokenFailureReason } from "@/lib/google";
import { BRANDS, type BrandId } from "@/lib/platforms";
import { eachDay, type DateRange } from "@/lib/range";

export type YoutubeVideo = { id: string; title: string; views: number; likes: number; comments: number; publishedAt: string };
export type YoutubeDay = { date: string; views: number; minutes: number; subsGained: number; subsLost: number };
export type YoutubePeriod = { views: number; minutes: number; avgViewSec: number; subsNet: number; likes: number; comments: number; shares: number };
export type YoutubeTopVideo = { id: string; title: string; views: number; minutes: number; avgViewSec: number };
// 기간별 지표. 예전에 youtube.readonly만으로 발급한 토큰이면 권한이 없어 ok:false — 채널 현황은 그대로 보인다.
export type YoutubeAnalytics =
  | { ok: true; days: YoutubeDay[]; cur: YoutubePeriod; prev: YoutubePeriod | null; top: YoutubeTopVideo[]; lastDate: string | null }
  | { ok: false; reason: string; reconnect: boolean };
export type YoutubeSummary =
  | {
      ok: true;
      channelTitle: string;
      subscribers: number | null;
      totalViews: number;
      videoCount: number;
      videos: YoutubeVideo[];
      analytics: YoutubeAnalytics | null; // null: 기간 없이 부른 경우(내보내기 등)
    }
  | { ok: false; reason: string };

const API = "https://www.googleapis.com/youtube/v3";

async function get<T>(path: string, params: Record<string, string>, token: string): Promise<T | null> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${token}` },
    next: { revalidate: 600 }, // 쿼터 절약: 10분 캐시
  });
  return res.ok ? ((await res.json()) as T) : null;
}

const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

type Report = { columnHeaders?: { name: string }[]; rows?: (string | number)[][] };
type ApiError = { error?: { code?: number; message?: string; errors?: { reason?: string }[]; status?: string } };

async function report(params: Record<string, string>, token: string): Promise<{ ok: true; r: Report } | { ok: false; status: number; reason: string }> {
  const res = await fetch(`${ANALYTICS}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${token}` },
    next: { revalidate: 600 },
  });
  if (res.ok) return { ok: true, r: (await res.json()) as Report };
  const e = ((await res.json().catch(() => ({}))) as ApiError).error;
  return { ok: false, status: res.status, reason: e?.errors?.[0]?.reason ?? e?.status ?? `http_${res.status}` };
}

// 표의 행을 열 이름으로 읽는다.
function rowsOf(r: Report): Record<string, string | number>[] {
  const names = (r.columnHeaders ?? []).map((h) => h.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]])));
}
const num = (v: string | number | undefined) => Number(v ?? 0) || 0;

export function periodOf(days: YoutubeDay[], extra?: { likes: number; comments: number; shares: number }): YoutubePeriod {
  const views = days.reduce((a, d) => a + d.views, 0);
  const minutes = days.reduce((a, d) => a + d.minutes, 0);
  return {
    views,
    minutes,
    avgViewSec: views ? (minutes * 60) / views : 0,
    subsNet: days.reduce((a, d) => a + d.subsGained - d.subsLost, 0),
    likes: extra?.likes ?? 0,
    comments: extra?.comments ?? 0,
    shares: extra?.shares ?? 0,
  };
}

function analyticsFailure(status: number, reason: string): { ok: false; reason: string; reconnect: boolean } {
  if (reason === "insufficientPermissions" || reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" || (status === 403 && reason === "PERMISSION_DENIED"))
    return { ok: false, reason: "기간별 지표 권한 없음 — '유튜브 다시 연결'로 분석 권한(yt-analytics.readonly)을 추가해 새 refresh token을 넣으세요", reconnect: true };
  if (reason === "accessNotConfigured" || reason === "SERVICE_DISABLED")
    return { ok: false, reason: "YouTube Analytics API가 꺼져 있습니다 — Google Cloud 콘솔(OAuth 클라이언트가 속한 프로젝트)에서 'YouTube Analytics API'를 사용 설정하세요", reconnect: false };
  if (reason === "forbidden" || status === 403)
    return { ok: false, reason: "이 토큰의 계정이 채널 소유자가 아닙니다 — 채널(브랜드 계정)을 골라 다시 연결하세요", reconnect: true };
  return { ok: false, reason: `기간별 지표 조회 실패 (${reason})`, reconnect: false };
}

// 기간별 지표: 직전 기간부터 선택 기간 끝까지 일별 한 번 + 기간 합계(좋아요·댓글·공유) 한 번 + 기간 인기 영상 한 번.
// 유튜브 분석은 보통 2~3일 늦게 채워지므로 아직 없는 날은 0으로 두고, 마지막으로 값이 있는 날을 함께 알려 준다.
async function youtubeAnalytics(channelId: string, range: DateRange, token: string): Promise<YoutubeAnalytics> {
  const ids = `channel==${channelId}`;
  const [daily, totals, top] = await Promise.all([
    report({ ids, startDate: range.prev.from, endDate: range.to, metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost", dimensions: "day", sort: "day" }, token),
    report({ ids, startDate: range.from, endDate: range.to, metrics: "likes,comments,shares" }, token),
    report({ ids, startDate: range.from, endDate: range.to, metrics: "views,estimatedMinutesWatched,averageViewDuration", dimensions: "video", sort: "-views", maxResults: "10" }, token),
  ]);
  if (!daily.ok) return analyticsFailure(daily.status, daily.reason);

  const byDate = new Map(rowsOf(daily.r).map((x) => [String(x.day), x]));
  const all: YoutubeDay[] = eachDay(range.prev.from, range.to).map((date) => {
    const x = byDate.get(date);
    return { date, views: num(x?.views), minutes: num(x?.estimatedMinutesWatched), subsGained: num(x?.subscribersGained), subsLost: num(x?.subscribersLost) };
  });
  const days = all.slice(-range.days);
  const prevDays = all.slice(0, -range.days);
  const t = totals.ok ? rowsOf(totals.r)[0] : undefined;
  const filled = [...byDate.keys()].filter((d) => d >= range.from).sort();

  let topVideos: YoutubeTopVideo[] = [];
  if (top.ok) {
    const rows = rowsOf(top.r);
    const titles = new Map<string, string>();
    if (rows.length) {
      const v = await get<{ items?: { id: string; snippet: { title: string } }[] }>("videos", { part: "snippet", id: rows.map((x) => String(x.video)).join(",") }, token);
      for (const i of v?.items ?? []) titles.set(i.id, i.snippet.title);
    }
    topVideos = rows.map((x) => ({
      id: String(x.video),
      title: titles.get(String(x.video)) ?? String(x.video),
      views: num(x.views),
      minutes: num(x.estimatedMinutesWatched),
      avgViewSec: num(x.averageViewDuration),
    }));
  }
  return {
    ok: true,
    days,
    cur: periodOf(days, t ? { likes: num(t.likes), comments: num(t.comments), shares: num(t.shares) } : undefined),
    prev: prevDays.length && !range.today ? periodOf(prevDays) : null,
    top: topVideos,
    lastDate: filled.length ? filled[filled.length - 1] : null,
  };
}

export async function youtubeSummary(brand: BrandId, range?: DateRange): Promise<YoutubeSummary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const refresh = process.env[`${prefix}_YOUTUBE_REFRESH_TOKEN`];
  const channelId = process.env[`${prefix}_YOUTUBE_CHANNEL_ID`];
  if (!refresh || !channelId) return { ok: false, reason: "자격증명 없음" };
  try {
    const t = await googleToken(refresh);
    if (!t.ok) {
      logFailure("youtube", brand, `token ${t.error}`);
      return { ok: false, reason: tokenFailureReason(t.error, `${prefix}_YOUTUBE_REFRESH_TOKEN`) };
    }
    const token = t.token;

    const ch = await get<{
      items?: {
        snippet: { title: string };
        statistics: { subscriberCount?: string; hiddenSubscriberCount?: boolean; viewCount?: string; videoCount?: string };
        contentDetails: { relatedPlaylists: { uploads: string } };
      }[];
    }>("channels", { part: "snippet,statistics,contentDetails", id: channelId }, token);
    const channel = ch?.items?.[0];
    if (!channel) return { ok: false, reason: "채널을 찾지 못함 — CHANNEL_ID 확인" };

    const pl = await get<{ items?: { contentDetails: { videoId: string } }[] }>(
      "playlistItems",
      { part: "contentDetails", playlistId: channel.contentDetails.relatedPlaylists.uploads, maxResults: "8" },
      token,
    );
    const ids = (pl?.items ?? []).map((i) => i.contentDetails.videoId);
    let videos: YoutubeVideo[] = [];
    if (ids.length) {
      const v = await get<{
        items?: {
          id: string;
          snippet: { title: string; publishedAt: string };
          statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
        }[];
      }>("videos", { part: "snippet,statistics", id: ids.join(",") }, token);
      videos = (v?.items ?? [])
        .map((x) => ({
          id: x.id,
          title: x.snippet.title,
          publishedAt: x.snippet.publishedAt,
          views: Number(x.statistics.viewCount ?? 0),
          likes: Number(x.statistics.likeCount ?? 0),
          comments: Number(x.statistics.commentCount ?? 0),
        }))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    }
    const s = channel.statistics;
    let analytics: YoutubeAnalytics | null = null;
    if (range) {
      analytics = await youtubeAnalytics(channelId, range, token).catch(() => ({ ok: false as const, reason: "기간별 지표 조회 실패(네트워크)", reconnect: false }));
      if (!analytics.ok) logFailure("youtube", brand, `analytics ${analytics.reason}`);
    }
    return {
      ok: true,
      channelTitle: channel.snippet.title,
      subscribers: s.hiddenSubscriberCount || s.subscriberCount == null ? null : Number(s.subscriberCount),
      totalViews: Number(s.viewCount ?? 0),
      videoCount: Number(s.videoCount ?? 0),
      videos,
      analytics,
    };
  } catch {
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
