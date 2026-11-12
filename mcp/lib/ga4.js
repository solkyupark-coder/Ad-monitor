// GA4 자유 조회: ad-monitor 대시보드의 /api/ga4/query(GA_REFRESH_TOKEN으로 GA4 Data API 호출)를 GA4_QUERY_KEY로 부른다.
// 이 서버에는 구글 토큰을 두지 않는다. 결과는 표 형태 글로 돌려준다.
import { BRAND_NAME, UserError, env, needBrand, needEnv, readJson } from "./util.js";

const DASHBOARD = "https://ad-monitor-eight.vercel.app";
const BRAND_ID = { topo: "topogenesis", houscaper: "houscaper" };
const MAX_TEXT = 60000;

function simpleFilter(f) {
  if (!f) return null;
  const list = Array.isArray(f) ? f : [f];
  const exprs = list.map((x) => {
    if (!x || !x.field || x.value == null) throw new UserError("filters 항목에는 field와 value가 필요합니다.");
    const match = x.match ?? "exact";
    const filter =
      match === "in"
        ? { fieldName: x.field, inListFilter: { values: String(x.value).split(",").map((s) => s.trim()).filter(Boolean) } }
        : { fieldName: x.field, stringFilter: { matchType: { exact: "EXACT", contains: "CONTAINS", begins: "BEGINS_WITH", regex: "FULL_REGEXP" }[match] ?? "EXACT", value: String(x.value), caseSensitive: false } };
    return x.not ? { notExpression: { filter } } : { filter };
  });
  return exprs.length === 1 ? exprs[0] : { andGroup: { expressions: exprs } };
}

const fmt = (v) => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(3).replace(/\.?0+$/, "")) : String(v).replace(/\|/g, "/"));

export async function ga4Report(a) {
  const brand = needBrand(a.brand);
  needEnv(["GA4_QUERY_KEY"], "GA4 조회");
  const kind = a.kind ?? "report";
  const filters = [simpleFilter(a.filters), a.dimension_filter ?? null].filter(Boolean);
  const body = {
    brand: BRAND_ID[brand],
    kind,
    dimensions: a.dimensions ?? [],
    metrics: a.metrics ?? [],
    startDate: a.start_date,
    endDate: a.end_date,
    compareStartDate: a.compare_start_date,
    compareEndDate: a.compare_end_date,
    dimensionFilter: filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { andGroup: { expressions: filters } },
    metricFilter: a.metric_filter,
    orderBy: a.order_by,
    limit: a.limit,
    includeAll: !!a.include_all,
  };
  const base = (env("GA4_QUERY_URL") ?? DASHBOARD).replace(/\/$/, "");
  const res = await fetch(`${base}/api/ga4/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${env("GA4_QUERY_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new UserError("ad-monitor 대시보드에 닿지 못했습니다(네트워크).");
  const j = await readJson(res);
  if (res.status === 401) throw new UserError("GA4 조회 열쇠가 맞지 않습니다. ad-monitor와 ad-monitor-mcp의 GA4_QUERY_KEY가 같은지, 둘 다 재배포됐는지 확인하세요.");
  if (res.status === 404) throw new UserError("대시보드에 GA4 조회 기능이 아직 배포되지 않았습니다(/api/ga4/query 없음).");
  if (!j.ok) throw new UserError(`GA4 조회 실패: ${j.reason ?? j.error ?? `HTTP ${res.status}`}`);

  const title = `[${BRAND_NAME[brand]} GA4 ${kind === "metadata" ? "쓸 수 있는 차원·지표" : kind === "realtime" ? "실시간" : "보고서"}]`;
  if (kind === "metadata") {
    const line = (x) => `${x.name} (${x.label}${x.category ? ` · ${x.category}` : ""})`;
    const out = `${title}\n■ 차원 ${j.dimensions.length}개\n${j.dimensions.map(line).join("\n")}\n\n■ 지표 ${j.metrics.length}개\n${j.metrics.map(line).join("\n")}`;
    return out.length > MAX_TEXT ? out.slice(0, MAX_TEXT) + "\n…(잘림)" : out;
  }
  const ranges = (j.dateRanges ?? []).map((r) => `${r.name === "previous" ? "비교" : "기간"} ${r.startDate}~${r.endDate}`).join(" · ");
  const head = `${title} ${ranges}\n${j.note ?? ""}${j.currency ? ` · 통화 ${j.currency}` : ""}\n행 ${j.rows.length}개${j.truncated ? ` (전체 ${j.rowCount}개 중 일부 — limit을 올리거나 필터로 좁히세요)` : ""}`;
  if (!j.rows.length) return `${head}\n결과 없음`;
  const table = [`| ${j.headers.join(" | ")} |`, `|${j.headers.map(() => "---").join("|")}|`, ...j.rows.map((r) => `| ${r.map(fmt).join(" | ")} |`)].join("\n");
  const out = `${head}\n\n${table}`;
  return out.length > MAX_TEXT ? out.slice(0, MAX_TEXT) + "\n…(잘림 — limit을 줄이세요)" : out;
}
