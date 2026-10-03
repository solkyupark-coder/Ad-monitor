// 유튜브 읽기 전용 조회(YouTube Data API v3, scope: youtube.readonly). 자격증명/토큰 값은 화면·로그에 내지 않는다.
import { BRANDS, type BrandId } from "@/lib/platforms";

export type YoutubeVideo = { id: string; title: string; views: number };
export type YoutubeSummary =
  | { ok: true; channelTitle: string; subscribers: number | null; videos: YoutubeVideo[] }
  | { ok: false; reason: string };

const API = "https://www.googleapis.com/youtube/v3";

async function accessToken(refreshToken: string): Promise<string | null> {
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
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
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
        statistics: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
        contentDetails: { relatedPlaylists: { uploads: string } };
      }[];
    }>("channels", { part: "snippet,statistics,contentDetails", id: channelId }, token);
    const channel = ch?.items?.[0];
    if (!channel) return { ok: false, reason: "채널을 찾지 못함 — CHANNEL_ID 확인" };

    const pl = await get<{ items?: { contentDetails: { videoId: string } }[] }>(
      "playlistItems",
      { part: "contentDetails", playlistId: channel.contentDetails.relatedPlaylists.uploads, maxResults: "5" },
      token,
    );
    const ids = (pl?.items ?? []).map((i) => i.contentDetails.videoId);
    let videos: YoutubeVideo[] = [];
    if (ids.length) {
      const v = await get<{ items?: { id: string; snippet: { title: string }; statistics: { viewCount?: string } }[] }>(
        "videos",
        { part: "snippet,statistics", id: ids.join(",") },
        token,
      );
      videos = (v?.items ?? []).map((x) => ({ id: x.id, title: x.snippet.title, views: Number(x.statistics.viewCount ?? 0) }));
    }
    const s = channel.statistics;
    return {
      ok: true,
      channelTitle: channel.snippet.title,
      subscribers: s.hiddenSubscriberCount || s.subscriberCount == null ? null : Number(s.subscriberCount),
      videos,
    };
  } catch {
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
