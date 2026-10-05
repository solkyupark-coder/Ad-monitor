// 유튜브 읽기 전용 조회(YouTube Data API v3, scope: youtube.readonly). 자격증명/토큰 값은 화면·로그에 내지 않는다.
import { googleToken, logFailure, tokenFailureReason } from "@/lib/google";
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
