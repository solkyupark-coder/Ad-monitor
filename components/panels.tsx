import type { Ga4Summary } from "@/lib/ga4";
import type { GoogleAdsSummary } from "@/lib/googleads";
import type { RevenueSummary } from "@/lib/revenue";
import type { DateRange } from "@/lib/range";
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

export function Ga4Panel({ g, range }: { g: Ga4Summary; range: DateRange }) {
  if (!g.ok) return <ErrorPanel title="웹사이트 (GA4)" reason={g.reason} />;
  const { real, realPrev, split } = g;
  // 기본 화면은 의심 트래픽(데이터센터 도시·참여 5초 미만)을 뺀 실수치만 보여 준다.
  const clean = g.geo.filter((r) => !r.flag);
  const countries = byCountry(clean).slice(0, 10);
  const cities = clean.slice(0, 15);
  const sources = g.sources.filter((s) => !s.lowEngagement).slice(0, 10);
  const suspectCities = g.geo.filter((r) => r.flag).slice(0, 15);
  const suspectSources = g.sources.filter((s) => s.lowEngagement);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>웹사이트 (GA4)</h2>
        <p className="meta">{range.label} · 봇 의심 트래픽 제외</p>
      </div>
      <div className="kpis">
        <Stat label="실사용자" value={`${n(real.activeUsers)}명`} hero>
          <Delta cur={real.activeUsers} prev={realPrev.activeUsers} goodWhen="up" />
        </Stat>
        <Stat label="세션" value={real.sessions} kind="count">
          <Delta cur={real.sessions} prev={realPrev.sessions} goodWhen="up" />
        </Stat>
        <Stat label="참여율" value={pct(real.engagementRate)}>
          <Delta cur={real.engagementRate} prev={realPrev.engagementRate} goodWhen="up" />
        </Stat>
        <Stat label="세션당 참여시간" value={sec(real.avgEngagementSec)}>
          <Delta cur={real.avgEngagementSec} prev={realPrev.avgEngagementSec} goodWhen="up" />
        </Stat>
      </div>

      <h3>소스/매체 상위 10</h3>
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
            {sources.map((s) => (
              <tr key={s.sourceMedium}>
                <td className="name" title={s.sourceMedium}>
                  {s.sourceMedium}
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
                  <th className="num">사용자</th>
                  <th className="num">세션</th>
                  <th className="num">참여시간</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.country}>
                    <td>{c.country}</td>
                    <td className="num">{n(c.activeUsers)}</td>
                    <td className="num">{n(c.sessions)}</td>
                    <td className="num">{sec(c.sessions ? c.engagementSec / c.sessions : 0)}</td>
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
                  <tr key={`${c.country}/${c.city}`}>
                    <td className="name" title={`${c.city}, ${c.country}`}>
                      {c.city}
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

      {(split.suspectUsers > 0 || suspectSources.length > 0) && (
        <details className="excluded">
          <summary>
            제외된 의심 트래픽 보기 · 사용자 {n(split.suspectUsers)}명, 세션의 {pct(split.suspectShare)}
          </summary>
          <p className="fine">
            데이터센터 도시이거나, 표본 5세션 이상인데 세션당 참여시간이 {LOW_ENGAGEMENT_SEC}초 미만인 국가·소스는 위 수치에서 뺐습니다.
            휴리스틱이라 실사용자가 섞일 수 있습니다.{g.geoTruncated ? " 지역 행이 250개를 넘어 일부는 판정에서 빠졌습니다." : ""}
          </p>
          <ul className="fine">
            <li>
              전체(의심 포함) 활성 사용자 {n(g.total.activeUsers)}명 · 세션 {n(g.total.sessions)} · 직전 기간 {n(g.totalPrev.activeUsers)}명
            </li>
            {split.datacenterUsers > 0 && <li>데이터센터 도시 {n(split.datacenterUsers)}명</li>}
            {split.lowEngagementUsers > 0 && (
              <li>
                참여 {LOW_ENGAGEMENT_SEC}초 미만 국가 {n(split.lowEngagementUsers)}명 ({split.suspectCountries.map((c) => c.country).join(", ")})
              </li>
            )}
            {split.suspectPurchases > 0 && <li>의심 트래픽에서 찍힌 GA 구매 {n(split.suspectPurchases)}건 (매출 비교에서도 제외)</li>}
            {suspectSources.length > 0 && (
              <li>
                참여 {LOW_ENGAGEMENT_SEC}초 미만 소스: {suspectSources.map((s) => `${s.sourceMedium} (${n(s.sessions)}세션, ${sec(s.sessions ? s.engagementSec / s.sessions : 0)})`).join(", ")}
              </li>
            )}
          </ul>
          {suspectCities.length > 0 && (
            <div className="scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>제외된 도시</th>
                    <th>사유</th>
                    <th className="num">사용자</th>
                    <th className="num">세션</th>
                    <th className="num">참여시간</th>
                  </tr>
                </thead>
                <tbody>
                  {suspectCities.map((c) => (
                    <tr key={`${c.country}/${c.city}`}>
                      <td className="name" title={`${c.city}, ${c.country}`}>
                        {c.city}, {c.country}
                      </td>
                      <td>{c.flag === "datacenter" ? "데이터센터" : `참여 ${LOW_ENGAGEMENT_SEC}초 미만`}</td>
                      <td className="num">{n(c.activeUsers)}</td>
                      <td className="num">{n(c.sessions)}</td>
                      <td className="num">{sec(c.sessions ? c.engagementSec / c.sessions : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}
    </section>
  );
}

export function RevenuePanel({ real, ga, range }: { real: RevenueSummary; ga: Ga4Summary | null; range: DateRange }) {
  const gaOk = ga && ga.ok ? ga : null;
  const cmp = gaOk
    ? compareRevenue(
        { purchases: gaOk.real.purchases, revenue: gaOk.real.revenue, currency: gaOk.currency, datacenterPurchases: 0 },
        real.ok ? { orders: real.orders, amount: real.amount, currency: real.currency } : null,
      )
    : null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>실매출 (실제 결제 기준)</h2>
        <p className="meta">
          {range.label}{real.ok ? ` · ${real.source === "polar" ? "Polar" : "Supabase purchase"}` : ""}
        </p>
      </div>
      {real.ok ? (
        <div className="kpis">
          <Stat label="실제 결제 건수" value={real.orders} kind="count" hero />
          <Stat label="실제 매출" value={real.amount === null ? "집계 안 함" : fmtValue(real.amount, "won", real.currency)} />
          {gaOk && (
            <>
              <Stat label="GA purchase 건수" value={gaOk.real.purchases} kind="count">
                <Sub>봇 의심 제외 · 매출 근거로 쓰지 않음</Sub>
              </Stat>
              <Stat label="GA purchase 값" value={fmtValue(gaOk.real.revenue, "won", gaOk.currency || "KRW")} />
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
      {gaOk && gaOk.split.suspectPurchases > 0 && (
        <p className="fine">봇 의심 트래픽에서 찍힌 GA 구매 {n(gaOk.split.suspectPurchases)}건은 위 수치와 비교에서 뺐습니다.</p>
      )}
    </section>
  );
}

export function AdsPanel({ a, ga, range }: { a: GoogleAdsSummary; ga: Ga4Summary | null; range: DateRange }) {
  if (!a.ok) return <ErrorPanel title="구글 광고" reason={a.reason} />;
  const sum = (ds: typeof a.days) => ({
    clicks: ds.reduce((x, d) => x + d.clicks, 0),
    cost: ds.reduce((x, d) => x + d.cost, 0),
    impressions: ds.reduce((x, d) => x + d.impressions, 0),
  });
  const n_ = range.days;
  const curDays = a.days.slice(-n_);
  const cur = sum(curDays);
  const prevDays = a.days.slice(-2 * n_, -n_);
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
        <p className="meta">{a.accountName} · {range.label}</p>
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
          <TrendChart points={curDays.map((d) => ({ date: d.date, value: d.cost }))} kind="won" currency={a.currency} color="s1" name="비용" />
        </div>
        <div>
          <h3>일별 클릭</h3>
          <TrendChart points={curDays.map((d) => ({ date: d.date, value: d.clicks }))} kind="count" color="s2" name="클릭" />
        </div>
      </div>
      {a.campaigns.length > 0 && (
        <>
          <h3>캠페인별 (비용 순)</h3>
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
