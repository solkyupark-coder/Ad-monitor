import type { Ga4Summary } from "@/lib/ga4";
import type { GoogleAdsSummary } from "@/lib/googleads";
import type { RevenueSummary } from "@/lib/revenue";
import { adsEngagement, byCountry, compareRevenue, findGoogleCpc, LOW_ENGAGEMENT_SEC } from "@/lib/traffic";
import { fmtCompact, fmtValue } from "@/lib/format";
import { TrendChart } from "@/components/TrendChart";
import { Delta, Stat } from "@/components/ui";

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const sec = (s: number) => (s < 10 ? `${s.toFixed(1)}초` : s < 60 ? `${Math.round(s)}초` : `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`);
const n = (v: number) => fmtValue(v, "count");
const Sub = ({ children }: { children: React.ReactNode }) => <span className="delta flat">{children}</span>;

function ErrorPanel({ title, reason }: { title: string; reason: string }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p className="note">{reason}</p>
    </section>
  );
}

export function Ga4Panel({ g }: { g: Ga4Summary }) {
  if (!g.ok) return <ErrorPanel title="웹사이트 (GA4)" reason={g.reason} />;
  const { d7, d28, split } = g;
  const countries = byCountry(g.geo).slice(0, 10);
  const suspectByCountry = new Map<string, number>();
  for (const r of g.geo) if (r.flag) suspectByCountry.set(r.country, (suspectByCountry.get(r.country) ?? 0) + r.sessions);
  const cities = g.geo.slice(0, 15);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>웹사이트 (GA4)</h2>
        <p className="meta">최근 7일 (어제까지) · 28일은 비교용</p>
      </div>
      <div className="kpis">
        <Stat label="실사용자 추정 (7일)" value={`약 ${n(split.realUsers)}명`} hero>
          <Sub>
            활성 사용자 {n(split.totalUsers)}명 − 의심 {n(split.suspectUsers)}명
          </Sub>
        </Stat>
        <Stat label="활성 사용자 (7일)" value={d7.activeUsers} kind="count">
          <Sub>28일 {n(d28.activeUsers)}</Sub>
        </Stat>
        <Stat label="세션 (7일)" value={d7.sessions} kind="count">
          <Sub>28일 {n(d28.sessions)}</Sub>
        </Stat>
        <Stat label="참여율 (7일)" value={pct(d7.engagementRate)}>
          <Sub>28일 {pct(d28.engagementRate)}</Sub>
        </Stat>
        <Stat label="세션당 참여시간 (7일)" value={sec(d7.avgEngagementSec)}>
          <Sub>28일 {sec(d28.avgEngagementSec)}</Sub>
        </Stat>
        <Stat label="의심 트래픽 (세션 기준)" value={pct(split.suspectShare)}>
          <Sub>{n(split.suspectSessions)} / {n(split.totalSessions)} 세션</Sub>
        </Stat>
      </div>

      {split.suspectUsers > 0 && (
        <div className="alert warn" role="status">
          <strong>⚠ 의심 트래픽 {n(split.suspectUsers)}명 (세션의 {pct(split.suspectShare)})</strong>
          <ul>
            {split.datacenterUsers > 0 && <li>데이터센터 도시 {n(split.datacenterUsers)}명 (구매 {n(split.datacenterPurchases)}건 포함)</li>}
            {split.lowEngagementUsers > 0 && (
              <li>
                세션당 참여 {LOW_ENGAGEMENT_SEC}초 미만 국가 {n(split.lowEngagementUsers)}명 (
                {split.suspectCountries.map((c) => c.country).join(", ")})
              </li>
            )}
          </ul>
          <p className="fine">
            판정 기준: 데이터센터 도시 목록에 있거나, 표본 5세션 이상인데 평균 참여시간이 {LOW_ENGAGEMENT_SEC}초 미만인 국가. 휴리스틱이라 실사용자가 섞일 수 있습니다.
            {g.geoTruncated ? " 지역 행이 250개를 넘어 일부는 집계에서 빠졌습니다." : ""}
          </p>
        </div>
      )}

      <h3>소스/매체 상위 10 (7일)</h3>
      <div className="scroll">
        <table className="data">
          <thead>
            <tr>
              <th>소스 / 매체</th>
              <th className="num">세션</th>
              <th className="num">활성 사용자</th>
              <th className="num">참여율</th>
              <th className="num">세션당 참여시간</th>
            </tr>
          </thead>
          <tbody>
            {g.sources.slice(0, 10).map((s) => (
              <tr key={s.sourceMedium} className={s.lowEngagement ? "flag" : ""}>
                <td className="name" title={s.sourceMedium}>
                  {s.sourceMedium}
                  {s.lowEngagement && <span className="badge bad">참여 {LOW_ENGAGEMENT_SEC}초 미만</span>}
                </td>
                <td className="num">{n(s.sessions)}</td>
                <td className="num">{n(s.activeUsers)}</td>
                <td className="num">{pct(s.sessions ? s.engagedSessions / s.sessions : 0)}</td>
                <td className="num">{sec(s.sessions ? s.engagementSec / s.sessions : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="two">
        <div>
          <h3>국가 상위 10</h3>
          <div className="scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>국가</th>
                  <th className="num">세션</th>
                  <th className="num">참여시간</th>
                  <th className="num">의심 비율</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.country} className={c.lowEngagement ? "flag" : ""}>
                    <td>{c.country}</td>
                    <td className="num">{n(c.sessions)}</td>
                    <td className="num">{sec(c.sessions ? c.engagementSec / c.sessions : 0)}</td>
                    <td className="num">{c.sessions ? pct((suspectByCountry.get(c.country) ?? 0) / c.sessions) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>도시 상위 15</h3>
          <div className="scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>도시</th>
                  <th className="num">세션</th>
                  <th className="num">참여시간</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={`${c.country}/${c.city}`} className={c.flag ? "flag" : ""}>
                    <td className="name" title={`${c.city}, ${c.country}`}>
                      {c.city}
                      {c.flag === "datacenter" && <span className="badge bad">데이터센터</span>}
                      {c.flag === "low-engagement" && <span className="badge bad">참여 {LOW_ENGAGEMENT_SEC}초 미만</span>}
                    </td>
                    <td className="num">{n(c.sessions)}</td>
                    <td className="num">{sec(c.sessions ? c.engagementSec / c.sessions : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function RevenuePanel({ real, ga }: { real: RevenueSummary; ga: Ga4Summary | null }) {
  const gaOk = ga && ga.ok ? ga : null;
  const cmp = gaOk
    ? compareRevenue(
        { purchases: gaOk.d7.purchases, revenue: gaOk.d7.revenue, currency: gaOk.currency, datacenterPurchases: gaOk.split.datacenterPurchases },
        real.ok ? { orders: real.orders, amount: real.amount, currency: real.currency } : null,
      )
    : null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>실매출 (실제 결제 기준)</h2>
        <p className="meta">
          최근 7일 (어제까지){real.ok ? ` · ${real.source === "polar" ? "Polar" : "Supabase purchase"}` : ""}
        </p>
      </div>
      {real.ok ? (
        <div className="kpis">
          <Stat label="실제 결제 건수" value={real.orders} kind="count" hero />
          <Stat label="실제 매출" value={real.amount === null ? "집계 안 함" : fmtValue(real.amount, "won", real.currency)} />
          {gaOk && (
            <>
              <Stat label="GA purchase 건수" value={gaOk.d7.purchases} kind="count">
                <Sub>매출 근거로 쓰지 않음</Sub>
              </Stat>
              <Stat label="GA purchase 값" value={fmtValue(gaOk.d7.revenue, "won", gaOk.currency || "KRW")} />
            </>
          )}
        </div>
      ) : (
        <p className="note">{real.reason}</p>
      )}
      {real.ok && real.truncated && <p className="fine">주문이 많아 일부만 집계됐을 수 있습니다.</p>}
      {cmp && cmp.level === "warn" && (
        <div className="alert warn" role="alert">
          <strong>⚠ GA purchase와 실매출이 다릅니다</strong>
          <p>{cmp.message}</p>
        </div>
      )}
      {cmp && cmp.level === "ok" && <p className="ok-line">✓ {cmp.message}</p>}
      {cmp && cmp.level === "none" && <p className="fine">{cmp.message}</p>}
    </section>
  );
}

export function AdsPanel({ a, ga }: { a: GoogleAdsSummary; ga: Ga4Summary | null }) {
  if (!a.ok) return <ErrorPanel title="구글 광고" reason={a.reason} />;
  const sum = (ds: typeof a.days) => ({
    clicks: ds.reduce((x, d) => x + d.clicks, 0),
    cost: ds.reduce((x, d) => x + d.cost, 0),
    impressions: ds.reduce((x, d) => x + d.impressions, 0),
  });
  const cur = sum(a.days.slice(-7));
  const prevDays = a.days.slice(-14, -7);
  const prev = prevDays.length ? sum(prevDays) : null;
  const k = (t: { clicks: number; cost: number; impressions: number }) => ({
    ...t,
    ctr: t.impressions ? t.clicks / t.impressions : 0,
    cpc: t.clicks ? t.cost / t.clicks : 0,
  });
  const c = k(cur);
  const p = prev ? k(prev) : null;
  const gaOk = ga && ga.ok ? ga : null;
  const eng = gaOk ? adsEngagement(cur.clicks, cur.cost, findGoogleCpc(gaOk.sources)) : null;
  const money = (v: number) => fmtValue(v, "won", a.currency);
  const maxCost = Math.max(...a.campaigns.map((x) => x.cost), 1);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>구글 광고</h2>
        <p className="meta">{a.accountName} · 최근 7일 (어제까지)</p>
      </div>
      <div className="kpis">
        <Stat label="비용" value={c.cost} kind="won" currency={a.currency} hero>
          <Delta cur={c.cost} prev={p?.cost ?? null} goodWhen="neutral" />
        </Stat>
        <Stat label="클릭" value={c.clicks} kind="count">
          <Delta cur={c.clicks} prev={p?.clicks ?? null} goodWhen="up" />
        </Stat>
        <Stat label="노출" value={c.impressions} kind="count">
          <Delta cur={c.impressions} prev={p?.impressions ?? null} goodWhen="up" />
        </Stat>
        <Stat label="클릭률(CTR)" value={c.ctr} kind="pct">
          <Delta cur={c.ctr} prev={p?.ctr ?? null} goodWhen="up" />
        </Stat>
        <Stat label="클릭당 비용(CPC)" value={c.cpc} kind="won" currency={a.currency}>
          <Delta cur={c.cpc} prev={p?.cpc ?? null} goodWhen="down" />
        </Stat>
      </div>

      {eng && (
        <>
          <h3>클릭당 실참여 (광고 클릭 → GA 참여 세션)</h3>
          {eng.missing ? (
            <div className="alert warn" role="alert">
              <strong>⚠ GA에 google / cpc 유입이 없습니다</strong>
              <p>광고 클릭 {n(cur.clicks)}건이 GA에 세션으로 잡히지 않았습니다. 자동 태그(gclid)와 GA4-구글 광고 연결을 확인하세요.</p>
            </div>
          ) : (
            <>
              <div className="kpis">
                <Stat label="광고 클릭" value={cur.clicks} kind="count" />
                <Stat label="GA 세션 (google / cpc)" value={eng.sessions} kind="count" />
                <Stat label="참여 세션" value={eng.engagedSessions} kind="count" />
                <Stat label="클릭당 실참여" value={eng.engagedPerClick === null ? "-" : pct(eng.engagedPerClick)} />
                <Stat label="참여 세션당 비용" value={eng.costPerEngaged === null ? "-" : money(eng.costPerEngaged)} />
                <Stat label="세션당 참여시간" value={sec(eng.avgEngagementSec)} />
              </div>
              {eng.lowEngagement && (
                <div className="alert warn" role="alert">
                  <strong>⚠ 광고 유입의 평균 참여가 {LOW_ENGAGEMENT_SEC}초 미만입니다</strong>
                  <p>클릭의 대부분이 즉시 이탈하거나 봇일 수 있습니다. 비용 대비 실참여를 확인하세요.</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      <div className="charts">
        <div>
          <h3>일별 비용</h3>
          <TrendChart points={a.days.map((d) => ({ date: d.date, value: d.cost }))} kind="won" currency={a.currency} color="s1" name="비용" />
        </div>
        <div>
          <h3>일별 클릭</h3>
          <TrendChart points={a.days.map((d) => ({ date: d.date, value: d.clicks }))} kind="count" color="s2" name="클릭" />
        </div>
      </div>
      {a.campaigns.length > 0 && (
        <>
          <h3>캠페인별 (최근 7일, 비용 순)</h3>
          <div className="scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>캠페인</th>
                  <th>비용</th>
                  <th className="num">노출</th>
                  <th className="num">클릭</th>
                  <th className="num">CTR</th>
                </tr>
              </thead>
              <tbody>
                {a.campaigns.map((x) => (
                  <tr key={x.name}>
                    <td className="name" title={x.name}>
                      {x.name}
                    </td>
                    <td>
                      <span className="inline-bar">
                        <span style={{ width: `${(x.cost / maxCost) * 100}%` }} />
                      </span>
                      <span className="num">{money(x.cost)}</span>
                    </td>
                    <td className="num">{fmtCompact(x.impressions)}</td>
                    <td className="num">{fmtCompact(x.clicks)}</td>
                    <td className="num">{x.impressions ? pct(x.clicks / x.impressions) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
