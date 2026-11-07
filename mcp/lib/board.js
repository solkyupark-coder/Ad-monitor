// 읽기: 일일 상황·세부 수치(Edge Config "status"·"metrics"), 메시지 보드(비공개 Vercel Blob, messages/ 아래 한 건당 한 파일).
import { put, list, get } from "@vercel/blob";
import { BRAND_NAME, env, UserError } from "./util.js";

export const PROJECTS = { "ad-monitor": "ad-monitor", topo: "토포제네시스", houscaper: "하우스케이퍼", all: "전체" };

// EDGE_CONFIG_TOKEN은 Edge Config 읽기 토큰일 수도, Vercel API 토큰일 수도 있어 둘 다 시도한다.
async function edgeItem(key) {
  const id = env("EDGE_CONFIG_ID");
  const token = env("EDGE_CONFIG_TOKEN");
  if (!id || !token) throw new UserError("EDGE_CONFIG_ID / EDGE_CONFIG_TOKEN이 없습니다.");
  const r1 = await fetch(`https://edge-config.vercel.com/${id}/item/${key}?token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
  if (r1 && r1.ok) return r1.json();
  if (r1 && r1.status === 404) return null; // 읽기 토큰이 맞고 그 키가 아직 없음
  const team = env("VERCEL_TEAM_ID") ? `?teamId=${encodeURIComponent(env("VERCEL_TEAM_ID"))}` : "";
  const r2 = await fetch(`https://api.vercel.com/v1/edge-config/${id}/item/${key}${team}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (r2 && r2.ok) {
    const j = await r2.json();
    return j && typeof j === "object" && "value" in j ? j.value : j;
  }
  if (r2 && r2.status === 404) return null;
  throw new UserError(`Edge Config 읽기 실패(HTTP ${r2?.status ?? r1?.status ?? "네트워크"}).`);
}

const bullets = (xs) => (Array.isArray(xs) ? xs : xs ? [xs] : []).map((x) => (String(x).startsWith("•") ? String(x) : `• ${x}`)).join("\n");

export async function dailyStatus(brand = "all") {
  const v = await edgeItem("status");
  if (!v) return "아직 오늘 상황이 올라오지 않았습니다(매일 08:52 KST 갱신).";
  if (typeof v === "string") return v;
  const parts = [`[ad-monitor 일일 상황 · ${v.date ?? "?"}]`];
  if (v.common?.length) parts.push(bullets(v.common));
  for (const b of brand === "all" ? ["topo", "houscaper"] : [brand]) {
    if (v[b]?.length) parts.push(`\n■ ${BRAND_NAME[b]}\n${bullets(v[b])}`);
  }
  if (v.source) parts.push(`\n출처: ${v.source}`);
  return parts.join("\n");
}

export async function metrics(brand = "all") {
  const v = await edgeItem("metrics");
  if (!v) return "아직 세부 수치가 없습니다(ad-monitor가 매일 아침 올립니다).";
  if (typeof v === "string") return v;
  const head = `[세부 수치 · ${v.date ?? "?"}${v.period ? ` · ${v.period}` : ""}]`;
  const parts = [head];
  for (const b of brand === "all" ? ["topo", "houscaper"] : [brand]) {
    if (v[b]) parts.push(`\n■ ${BRAND_NAME[b]}\n${typeof v[b] === "string" ? v[b] : JSON.stringify(v[b], null, 1)}`);
  }
  if (v.note) parts.push(`\n${v.note}`);
  return parts.join("\n");
}

function needBlob() {
  if (!env("BLOB_READ_WRITE_TOKEN")) throw new UserError("메시지 저장소(BLOB_READ_WRITE_TOKEN)가 연결되지 않았습니다.");
}

export async function postMessage({ from, to, text }) {
  needBlob();
  if (!PROJECTS[from] || from === "all") throw new UserError("from은 ad-monitor, topo, houscaper 중 하나여야 합니다.");
  if (!PROJECTS[to]) throw new UserError("to는 ad-monitor, topo, houscaper, all 중 하나여야 합니다.");
  const body = String(text ?? "").trim();
  if (!body) throw new UserError("text가 비어 있습니다.");
  if (body.length > 4000) throw new UserError("text는 4000자까지입니다.");
  const at = new Date().toISOString();
  const id = `${at.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  await put(`messages/${id}.json`, JSON.stringify({ id, from, to, text: body, at, created_at: at }), { access: "private", contentType: "application/json", addRandomSuffix: false });
  return `보냈습니다: ${PROJECTS[from]} → ${PROJECTS[to]} (${at})`;
}

async function readBlobJson(b) {
  const r = await get(b.pathname, { access: "private" }).catch(() => null);
  if (!r || !r.stream) return null;
  const text = await new Response(r.stream).text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function readMessages({ for: who, limit = 20, since }) {
  needBlob();
  if (!PROJECTS[who] || who === "all") throw new UserError("for는 ad-monitor, topo, houscaper 중 하나여야 합니다.");
  const max = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const sinceMs = since ? Date.parse(since) : NaN;
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: "messages/", limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor && blobs.length < 5000);
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const out = [];
  for (let i = 0; i < blobs.length && out.length < max && i < 300; i += 10) {
    const batch = blobs.slice(i, i + 10).filter((b) => !(sinceMs && new Date(b.uploadedAt).getTime() <= sinceMs));
    if (!batch.length) break;
    const msgs = await Promise.all(batch.map(async (b) => ({ b, m: await readBlobJson(b) })));
    for (const { b, m } of msgs) {
      if (!m) continue;
      const to = m.to ?? m.recipient;
      if (to !== who && to !== "all") continue;
      const at = m.at ?? m.created_at ?? m.createdAt ?? m.ts ?? new Date(b.uploadedAt).toISOString();
      if (sinceMs && Date.parse(at) <= sinceMs) continue;
      out.push({ at, from: m.from ?? m.sender ?? "?", to, text: m.text ?? m.message ?? "" });
      if (out.length >= max) break;
    }
  }
  if (!out.length) return "새 메시지가 없습니다.";
  return out.map((m) => `[${m.at}] ${PROJECTS[m.from] ?? m.from} → ${PROJECTS[m.to] ?? m.to}\n${m.text}`).join("\n\n");
}
