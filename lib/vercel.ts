// 브랜드 사이트의 Vercel 데이터(읽기 전용): 프로덕션 배포 기록 + Web Analytics(방문자·페이지뷰·상위 페이지·유입).
// VERCEL_API_TOKEN 은 화면·로그에 내지 않는다. Web Analytics가 꺼진 프로젝트면 배포 기록만 보인다.
import type { BrandId } from "@/lib/platforms";
import { BRANDS } from "@/lib/platforms";
import { eachDay, rangeInstants, type DateRange } from "@/lib/range";

const API = "https://api.vercel.com";

export type VercelDeploy = { id: string; createdAt: string; state: string; message: string };
export type VercelDay = { date: string; pageviews: number; visitors: number };
export type VercelTop = { key: string; pageviews: number; visitors: number };
export type VercelSummary =
  | {
      ok: true;
      projectName: string;
      deploys: VercelDeploy[]; // 최근 프로덕션 배포(최신순)
      analytics:
        | { ok: true; days: VercelDay[]; pages: VercelTop[]; referrers: VercelTop[]; countries: VercelTop[] }
        | { ok: false; reason: string };
    }
  | { ok: false; reason: string };

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

async function call(path: string, params: Record<string, string | string[]>, token: string): Promise<{ status: number; json: Row | null }> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  const res = await fetch(`${API}${path}?${q}`, { headers: { authorization: `Bearer ${token}` }, next: { revalidate: 600 } });
  return { status: res.status, json: res.ok ? ((await res.json()) as Row) : null };
}

// 응답 행 하나를 {key, pageviews, visitors}로. 필드 이름이 버전마다 조금 달라도 읽히게 한다.
function toTop(r: Row, dim: string): VercelTop {
  return { key: String(r[dim] ?? r.key ?? "(없음)"), pageviews: num(r.pageviews ?? r.count ?? r.total), visitors: num(r.visitors ?? r.devices) };
}

async function analytics(base: Record<string, string>, range: DateRange, token: string) {
  const cur = rangeInstants(range);
  const all = rangeInstants({ from: range.prev.from, to: range.to });
  const agg = (by: string, since: Date, until: Date, limit: string) =>
    call("/v1/query/web-analytics/visits/aggregate", { ...base, by, since: since.toISOString(), until: new Date(until.getTime() - 1).toISOString(), limit }, token);
  const [daily, pages, refs, countries] = await Promise.all([
    agg("day", all.since, all.until, "100"),
    agg("requestPath", cur.since, cur.until, "8"),
    agg("referrerHostname", cur.since, cur.until, "8"),
    agg("country", cur.since, cur.until, "8"),
  ]);
  if (daily.status === 401 || daily.status === 403) return { ok: false as const, reason: "Web Analytics 조회 권한 없음 — 토큰 범위(팀)를 확인하세요" };
  if (daily.status === 404 || daily.status === 400 || !daily.json) return { ok: false as const, reason: "Web Analytics가 꺼져 있거나 데이터가 없습니다 — Vercel 프로젝트 → Analytics에서 켜세요" };
  const rows = (daily.json.data as Row[]) ?? [];
  const byDate = new Map<string, VercelDay>();
  for (const r of rows) {
    const d = String(r.day ?? r.date ?? r.timestamp ?? r.key ?? "").slice(0, 10);
    if (d) byDate.set(d, { date: d, pageviews: num(r.pageviews ?? r.count ?? r.total), visitors: num(r.visitors ?? r.devices) });
  }
  const days = eachDay(range.prev.from, range.to).map((d) => byDate.get(d) ?? { date: d, pageviews: 0, visitors: 0 });
  const tops = (res: { json: Row | null }, dim: string) => (((res.json?.data as Row[]) ?? []).map((r) => toTop(r, dim)));
  return { ok: true as const, days, pages: tops(pages, "requestPath"), referrers: tops(refs, "referrerHostname"), countries: tops(countries, "country") };
}

export async function vercelSummary(brand: BrandId, range: DateRange): Promise<VercelSummary> {
  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const prefix = BRANDS.find((b) => b.id === brand)!.prefix;
  const projectId = process.env[`${prefix}_VERCEL_PROJECT_ID`];
  if (!token || !teamId || !projectId) return { ok: false, reason: "자격증명 없음" };
  const base = { teamId, projectId };
  try {
    const [proj, deps, an] = await Promise.all([
      call(`/v9/projects/${encodeURIComponent(projectId)}`, { teamId }, token),
      call("/v6/deployments", { ...base, target: "production", limit: "10" }, token),
      analytics(base, range, token),
    ]);
    if (deps.status === 401 || deps.status === 403) return { ok: false, reason: "Vercel 토큰 거절 — 팀 범위 읽기 토큰인지 확인하세요" };
    if (deps.status === 404) return { ok: false, reason: `프로젝트를 찾지 못함 — ${prefix}_VERCEL_PROJECT_ID 를 확인하세요` };
    if (!deps.json) return { ok: false, reason: "Vercel 조회 실패" };
    const deploys = ((deps.json.deployments as Row[]) ?? []).map((d) => ({
      id: String(d.uid ?? d.id ?? ""),
      createdAt: new Date(num(d.created ?? d.createdAt)).toISOString(),
      state: String(d.readyState ?? d.state ?? "UNKNOWN"),
      message: String((d.meta as Row | undefined)?.githubCommitMessage ?? "").split("\n")[0],
    }));
    return { ok: true, projectName: String(proj.json?.name ?? projectId), deploys, analytics: an };
  } catch {
    return { ok: false, reason: "Vercel 조회 실패(네트워크)" };
  }
}
