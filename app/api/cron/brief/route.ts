// 매일 아침(vercel.json crons) 두 브랜드 요약을 만들어 Edge Config "metrics"에 넣는다.
// ad-monitor-mcp의 get_metrics가 이 값을 그대로 읽으므로, 아침 보고·토포·하우스케이퍼 프로젝트가 Windsor 없이 같은 숫자를 본다.
// Vercel Cron은 CRON_SECRET을 Authorization: Bearer로 보낸다. 손으로 돌릴 때는 BRIEF_API_KEY도 받는다.
import { NextRequest } from "next/server";
import { brandBrief } from "@/lib/brief";
import { briefText } from "@/lib/brief-text";
import { bearerMatches } from "@/lib/brief-auth";
import { parseRange, offsetMs } from "@/lib/range";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: NextRequest) {
  if (!bearerMatches(req.headers.get("authorization"), process.env.CRON_SECRET, process.env.BRIEF_API_KEY)) return json({ error: "unauthorized" }, 401);
  const dry = req.nextUrl.searchParams.get("dry") === "1"; // 쓰지 않고 만들 글만 돌려준다(점검용)
  const ecfg = (process.env.BRIEF_EDGE_CONFIG_ID ?? "").trim();
  const token = process.env.BRIEF_EDGE_CONFIG_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!dry && (!/^ecfg_[a-z0-9]+$/.test(ecfg) || !token)) return json({ error: "BRIEF_EDGE_CONFIG_ID 또는 쓰기 토큰(BRIEF_EDGE_CONFIG_TOKEN/VERCEL_API_TOKEN)이 없습니다" }, 500);

  const day = parseRange({ range: "1" });
  const week = parseRange({ range: "7" });
  const [topoDay, topoWeek, hcDay, hcWeek] = await Promise.all([
    brandBrief("topogenesis", day),
    brandBrief("topogenesis", week),
    brandBrief("houscaper", day),
    brandBrief("houscaper", week),
  ]);
  const weekLabel = `최근 7일 ${week.from}~${week.to}`;
  const today = new Date(Date.now() + offsetMs()).toISOString().slice(0, 10);
  const value = {
    date: today,
    period: `어제 ${day.to} · ${weekLabel} (공식 API 직접 수집)`,
    topo: briefText(topoDay, topoWeek, weekLabel),
    houscaper: briefText(hcDay, hcWeek, weekLabel),
    note: "ad-monitor가 메타·구글 광고·GA4·Search Console·유튜브·엣시·레딧·틱톡 공식 API에서 직접 받은 값(Windsor 미사용). '못 읽음' 줄은 그 소스가 실패한 것이지 0이 아닙니다. GA4·유튜브·검색은 1~3일 늦게 채워질 수 있습니다.",
    source: "ad-monitor /api/cron/brief",
    generatedAt: new Date().toISOString(),
  };

  // Edge Config 저장소가 작다(무료 요금제 8KB, 기존 "status" 포함). 넘치면 브랜드 글 끝을 자른다.
  const LIMIT = 6000;
  const size = () => Buffer.byteLength(JSON.stringify(value), "utf8");
  const drop = (t: string) => t.split("\n").slice(0, -2).concat("…(잘림)").join("\n");
  for (let i = 0; i < 40 && size() > LIMIT; i++) {
    if (value.topo.length >= value.houscaper.length) value.topo = drop(value.topo);
    else value.houscaper = drop(value.houscaper);
  }
  if (dry) return json({ ok: true, dry: true, value });
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  const res = await fetch(`https://api.vercel.com/v1/edge-config/${ecfg}/items${team}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ items: [{ operation: "upsert", key: "metrics", value }] }),
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) {
    console.error(`[cron/brief] edge config write failed: HTTP ${res?.status ?? "network"}`);
    return json({ ok: false, error: `Edge Config 쓰기 실패(HTTP ${res?.status ?? "네트워크"}) — 토큰 권한·팀 ID를 확인하세요` }, 502);
  }
  return json({ ok: true, date: today, bytes: JSON.stringify(value).length });
}
