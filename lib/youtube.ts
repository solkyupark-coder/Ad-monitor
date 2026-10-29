// 유튜브 읽기 전용 조회(YouTube Data API v3, scope: youtube.readonly). 자격증명/토큰 값은 화면·로그에 내지 않는다.
import { BRANDS, type BrandId } from "@/lib/platforms";

export type YoutubeVideo = { id: string; title: string; views: number; likes: number; comments: number; publishedAt: string };
export type YoutubeSummary =
  | {
      ok: true;
      channelTitle: string;
      subscribers: number | null;
      totalViews: number;
      videoCount: number;
      videos: YoutubeVideo[];
    }
  | { ok: false; reason: string };

const API = "https://www.googleapis.com/youtube/v3";

// 데이터 fetch 캐시 키에 authorization 헤더가 들어가므로, 요청마다 새 토큰을 받으면 10분 캐시가 절대 맞지 않는다.
const tokens = new Map<string, { token: string; exp: number }>();

async function accessToken(refreshToken: string): Promise<string | null> {
  const hit = tokens.get(refreshToken);
  if (hit && hit.exp > Date.now()) return hit.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  tokens.set(refreshToken, { token: json.access_token, exp: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000 });
  return json.access_token;
}

async function get<T>(path: string, params: Record<string, string>, token: string): Promise<T | null> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${token}` },
    next: { revalidate: 600 }, // 쿼터 절약: 10분 캐시
  });
  return res.ok ? ((await res.json()) as T) : null;
}

export async function youtubeSummary(brand: BrandId): Promise<YoutubeSummary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const refresh = process.env[`${prefix}_YOUTUBE_REFRESH_TOKEN`];
  const channelId = process.env[`${prefix}_YOUTUBE_CHANNEL_ID`];
  if (!refresh || !channelId) return { ok: false, reason: "자격증명 없음" };
  try {
    const token = await accessToken(refresh);
    if (!token) return { ok: false, reason: "토큰 갱신 실패 — 동의를 다시 받아 refresh token을 교체하세요" };

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
    return {
      ok: true,
      channelTitle: channel.snippet.title,
      subscribers: s.hiddenSubscriberCount || s.subscriberCount == null ? null : Number(s.subscriberCount),
      totalViews: Number(s.viewCount ?? 0),
      videoCount: Number(s.videoCount ?? 0),
      videos,
    };
  } catch {
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
