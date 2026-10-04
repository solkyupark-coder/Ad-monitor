// 메타 광고 읽기 전용 조회(Marketing API insights). 토큰·ID 값은 화면·로그에 내지 않는다.
import { BRANDS, type BrandId } from "@/lib/platforms";

export type MetaSummary =
  | { ok: true; accountName: string; currency: string; spend: number; impressions: number; clicks: number }
  | { ok: false; reason: string };

const API = "https://graph.facebook.com/v21.0";

type GraphError = { error?: { code?: number } };

export async function metaSummary(brand: BrandId): Promise<MetaSummary> {
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const token = process.env[`${prefix}_META_ACCESS_TOKEN`];
  const rawId = process.env[`${prefix}_META_AD_ACCOUNT_ID`];
  if (!token || !rawId) return { ok: false, reason: "자격증명 없음" };
  const account = rawId.startsWith("act_") ? rawId : `act_${rawId}`;
  const headers = { authorization: `Bearer ${token}` };
  try {
    const [infoRes, insRes] = await Promise.all([
      fetch(`${API}/${account}?fields=name,currency`, { headers, next: { revalidate: 600 } }),
      fetch(`${API}/${account}/insights?fields=spend,impressions,clicks&date_preset=last_7d`, {
        headers,
        next: { revalidate: 600 },
      }),
    ]);
    if (!infoRes.ok || !insRes.ok) {
      const body = (await (infoRes.ok ? insRes : infoRes).json().catch(() => ({}))) as GraphError;
      if (body.error?.code === 190) return { ok: false, reason: "토큰 만료 또는 무효 — 장기 토큰을 다시 발급하세요" };
      if (body.error?.code === 10 || body.error?.code === 200) return { ok: false, reason: "권한 부족 — ads_read 권한을 확인하세요" };
      return { ok: false, reason: "조회 실패 — 광고 계정 ID와 토큰 권한을 확인하세요" };
    }
    const info = (await infoRes.json()) as { name?: string; currency?: string };
    const ins = (await insRes.json()) as { data?: { spend?: string; impressions?: string; clicks?: string }[] };
    const row = ins.data?.[0];
    return {
      ok: true,
      accountName: info.name ?? "",
      currency: info.currency ?? "",
      spend: Number(row?.spend ?? 0),
      impressions: Number(row?.impressions ?? 0),
      clicks: Number(row?.clicks ?? 0),
    };
  } catch {
    return { ok: false, reason: "조회 실패(네트워크)" };
  }
}
