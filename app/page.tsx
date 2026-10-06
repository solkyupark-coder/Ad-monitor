import { BRANDS, type BrandId } from "@/lib/platforms";
import { periodSplit, type MetaAccountRole, type MetaSummary } from "@/lib/meta";
import type { YoutubeSummary } from "@/lib/youtube";
import { fmtCompact, fmtDate, fmtValue } from "@/lib/format";
import { TrendChart } from "@/components/TrendChart";
import { BarList, Delta, Stat } from "@/components/ui";
import { AdsPanel, Ga4Panel, RevenuePanel, VercelPanel } from "@/components/panels";
import { ActionsPanel, OverviewPanel } from "@/components/Overview";
import { EffectPanel } from "@/components/EffectPanel";
import { LevelIcon } from "@/components/icons";
import { StateBadge } from "@/components/StateBadge";
import { isStopped } from "@/lib/campaign-state";
import { ViewTabs, type TabDef } from "@/components/ViewTabs";
import type { FlowSeries } from "@/components/FlowChart";
import { loadDashboard } from "@/lib/dashboard";
import { exportData } from "@/lib/export";
import { parseRange, PRESETS, rangeQuery, yesterdayDate, type DateRange } from "@/lib/range";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<MetaAccountRole, string> = { main: "대표(Ads Manager)", extra: "추가 계정", discovered: "비즈니스에서 찾은 계정" };
const STATUS: Record<string, { text: string; level: "good" | "warn" | "bad" | "hold" }> = {
  ACTIVE: { text: "진행 중", level: "good" },
  PAUSED: { text: "일시중지", level: "hold" },
  CAMPAIGN_PAUSED: { text: "일시중지", level: "hold" },
  ADSET_PAUSED: { text: "일시중지", level: "hold" },
  IN_PROCESS: { text: "처리 중", level: "hold" },
  PENDING_REVIEW: { text: "검토 중", level: "warn" },
  WITH_ISSUES: { text: "문제 있음", level: "warn" },
  DISAPPROVED: { text: "반려", level: "bad" },
  ARCHIVED: { text: "보관", level: "hold" },
  DELETED: { text: "삭제됨", level: "hold" },
};

const PLAIN_STATUS = new Set(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "DELETED", "ARCHIVED"]);

function MetaPanel({ m, range }: { m: MetaSummary; range: DateRange }) {
  if (!m.ok) {
    return (
      <section className="panel">
        <h2>메타 광고</h2>
        <p className="note">{m.reason}</p>
      </section>
    );
  }
  const { cur, prev } = periodSplit(m.days, range.days);
  const curDays = m.days.slice(-range.days);
  const maxSpend = Math.max(...m.campaigns.map((c) => c.spend), 1);
  const cur$ = (n: number) => fmtValue(n, "won", m.currency);
  const promos = m.campaigns.filter((c) => c.promo);
  const promoSpend = promos.reduce((a, c) => a + c.spend, 0);
  const multi = m.accounts.length > 1;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>메타 광고{promos.length || multi ? " · 인스타 프로모션 포함" : ""}</h2>
        <p className="meta">
          {m.accountName} · {range.label}
        </p>
      </div>
      <div className="kpis">
        <Stat label="지출" value={cur.spend} kind="won" currency={m.currency} hero>
          <Delta cur={cur.spend} prev={prev?.spend ?? null} goodWhen="neutral" />
        </Stat>
        <Stat label="노출" value={cur.impressions} kind="count">
          <Delta cur={cur.impressions} prev={prev?.impressions ?? null} goodWhen="up" />
        </Stat>
        <Stat label="클릭" value={cur.clicks} kind="count">
          <Delta cur={cur.clicks} prev={prev?.clicks ?? null} goodWhen="up" />
        </Stat>
        <Stat label="클릭률(CTR)" value={cur.ctr} kind="pct">
          <Delta cur={cur.ctr} prev={prev?.ctr ?? null} goodWhen="up" />
        </Stat>
        <Stat label="클릭당 비용(CPC)" value={cur.cpc} kind="won" currency={m.currency}>
          <Delta cur={cur.cpc} prev={prev?.cpc ?? null} goodWhen="down" />
        </Stat>
        <Stat label="1,000회 노출당 비용(CPM)" value={cur.cpm} kind="won" currency={m.currency}>
          <Delta cur={cur.cpm} prev={prev?.cpm ?? null} goodWhen="down" />
        </Stat>
      </div>
      {m.notes.map((n) => (
        <div key={n} className="alert warn" role="note">
          <p>{n}</p>
        </div>
      ))}
      <div className="promo-sum">
        <span className="vchip hold">
          <LevelIcon level={promos.length ? "good" : "hold"} size={11} />
          인스타·페이스북 프로모션(부스트)
        </span>
        <span>
          {promos.length ? (
            <>
              <strong>{cur$(promoSpend)}</strong> · 캠페인 {promos.length}개 (위 합계에 포함)
            </>
          ) : (
            "이 기간 프로모션 캠페인이 없습니다"
          )}
        </span>
      </div>
      {multi && (
        <>
          <h3>광고 계정별</h3>
          <ul className="acct-list">
            {m.accounts.map((a) => (
              <li key={a.id} className={a.ok ? "" : "bad"}>
                <span className="acct-name">
                  <strong>{a.ok ? a.name || a.id : a.id}</strong>
                  <span className="fine-inline">{ROLE_LABEL[a.role]}</span>
                </span>
                {a.ok ? (
                  <span className="acct-val">
                    {fmtValue(a.spend, "won", a.currency)} · 캠페인 {a.campaigns}개{a.included ? "" : " · 합계 제외(통화 다름)"}
                  </span>
                ) : (
                  <span className="acct-val bad">
                    <LevelIcon level="bad" size={11} /> {a.reason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="charts">
        <div>
          <h3>일별 지출</h3>
          <TrendChart points={curDays.map((d) => ({ date: d.date, value: d.spend }))} kind="won" currency={m.currency} color="s1" name="지출" />
        </div>
        <div>
          <h3>일별 클릭</h3>
          <TrendChart points={curDays.map((d) => ({ date: d.date, value: d.clicks }))} kind="count" color="s2" name="클릭" />
        </div>
      </div>
      {m.campaigns.length > 0 && (
        <>
          <h3>캠페인별 (지출 순)</h3>
          <div className="scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>캠페인</th>
                  <th>지출</th>
                  <th className="num">노출</th>
                  <th className="num">클릭</th>
                  <th className="num">CTR</th>
                </tr>
              </thead>
              <tbody>
                {m.campaigns.slice(0, 12).map((c, i) => {
                  // 집행 중/중지됨/삭제됨은 배지로 따로 보이므로, 여기서는 그 밖의 상태(검토 중·문제 있음·반려 등)만 칩으로 남긴다.
                  const st = c.status && !PLAIN_STATUS.has(c.status) ? STATUS[c.status] ?? { text: c.status, level: "hold" as const } : null;
                  return (
                  <tr key={`${c.account ?? ""}-${c.name}-${i}`} className={isStopped(c.state) ? "off" : undefined}>
                    <td className="name" title={c.account ? `${c.name} · ${c.account}` : c.name}>
                      {c.name}
                      <span className="tags">
                        <StateBadge state={c.state} raw={c.status} />
                        {c.paidBy && <span className="vchip warn" title="이 광고비는 다른 브랜드의 광고 계정에서 결제됐습니다">{c.paidBy}</span>}
                        {c.promo && !c.paidBy && <span className="vchip hold">프로모션</span>}
                        {st && (
                          <span className={`vchip ${st.level}`}>
                            <LevelIcon level={st.level} size={10} />
                            {st.text}
                          </span>
                        )}
                        {c.account && <span className="fine-inline">{c.account}</span>}
                      </span>
                    </td>
                    <td>
                      <span className="inline-bar">
                        <span style={{ width: `${(c.spend / maxSpend) * 100}%` }} />
                      </span>
                      <span className="num">{cur$(c.spend)}</span>
                    </td>
                    <td className="num">{fmtCompact(c.impressions)}</td>
                    <td className="num">{fmtCompact(c.clicks)}</td>
                    <td className="num">{c.impressions ? `${((c.clicks / c.impressions) * 100).toFixed(2)}%` : "-"}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function YoutubePanel({ y, brand }: { y: YoutubeSummary; brand: BrandId }) {
  if (!y.ok) {
    return (
      <section className="panel">
        <h2>유튜브</h2>
        <p className="note">{y.reason}</p>
        <p>
          <a className="connect" href={`/api/youtube/connect?brand=${brand}`}>
            유튜브 다시 연결
          </a>
          <span className="fine"> 구글 승인 후 새 refresh token을 한 번 보여 줍니다.</span>
        </p>
      </section>
    );
  }
  const avg = y.videos.length ? y.videos.reduce((a, v) => a + v.views, 0) / y.videos.length : 0;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>유튜브</h2>
        <p className="meta">{y.channelTitle} · 최근 업로드 {y.videos.length}개</p>
      </div>
      <div className="kpis">
        <Stat label="구독자" value={y.subscribers == null ? "비공개" : fmtValue(y.subscribers, "count")} hero />
        <Stat label="채널 총 조회수" value={y.totalViews} kind="count" />
        <Stat label="공개 영상" value={y.videoCount} kind="count" />
        <Stat label="최근 영상 평균 조회" value={avg} kind="count" />
      </div>
      <h3>최근 영상 조회수 (최신순)</h3>
      <BarList
        color="s1"
        items={y.videos.map((v) => ({
          id: v.id,
          label: v.title,
          value: v.views,
          display: fmtValue(v.views, "count"),
          note: `${v.publishedAt.slice(0, 10)} · 좋아요 ${fmtValue(v.likes, "count")} · 댓글 ${fmtValue(v.comments, "count")}`,
        }))}
      />
    </section>
  );
}

function RangePicker({ brand, range }: { brand: BrandId; range: DateRange }) {
  return (
    <div className="range">
      <nav className="presets" aria-label="조회 기간">
        {PRESETS.map((n) => (
          <a key={n} href={`/?brand=${brand}&range=${n}`} data-keep-hash className={range.preset === n ? "on" : ""}>
            {n}일
          </a>
        ))}
      </nav>
      <form method="get" action="/" data-keep-hash className={range.preset ? "custom" : "custom on"}>
        <input type="hidden" name="brand" value={brand} />
        <input type="date" name="from" defaultValue={range.from} max={yesterdayDate()} aria-label="시작일" required />
        <span>–</span>
        <input type="date" name="to" defaultValue={range.to} max={yesterdayDate()} aria-label="종료일" required />
        <button type="submit">적용</button>
      </form>
      <p className="fine">
        {range.label} · 비교: 직전 {range.days}일 ({fmtDate(range.prev.from)} – {fmtDate(range.prev.to)})
      </p>
    </div>
  );
}

// 광고 채널 전체의 참여 1회당 비용(통화가 하나이고 참여가 있을 때만).
function effectCostPerEngaged(e: import("@/lib/effect").EffectReport): number | null {
  if (e.mixedCurrency) return null;
  // GA4에서 유입이 잡힌 채널만 합친다 — 추적 안 되는 채널의 광고비를 분자에 넣으면 비용이 부풀려진다.
  const tracked = e.channels.filter((c) => c.sessions > 0);
  const spend = tracked.reduce((a, c) => a + c.spend, 0);
  const engaged = tracked.reduce((a, c) => a + c.engaged, 0);
  return engaged ? spend / engaged : null;
}

type Query = { brand?: string; range?: string; from?: string; to?: string };

export default async function Home({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams;
  const q = sp.brand;
  const brand: BrandId = BRANDS.some((b) => b.id === q) ? (q as BrandId) : "houscaper";
  const range = parseRange(sp);
  const d = await loadDashboard(brand, range);
  const { meta, yt, ga, rev, ads, vc, overview, effect, actions, pending } = d;

  // 한눈에 보기 일별 흐름: 광고비 / 클릭 / (있으면) 사이트 방문자 중 하나를 골라 본다.
  const flow: FlowSeries[] = [];
  const sumOf = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
  if (overview.daily.some((p) => p.spend !== null)) {
    flow.push({ key: "spend", label: "광고비", kind: "won", currency: overview.currency, total: fmtValue(sumOf(overview.daily.map((p) => p.spend ?? 0)), "won", overview.currency), points: overview.daily.map((p) => ({ date: p.date, value: p.spend ?? 0 })) });
  }
  if (overview.daily.length) {
    flow.push({ key: "clicks", label: "광고 클릭", kind: "count", total: fmtValue(sumOf(overview.daily.map((p) => p.clicks)), "count"), points: overview.daily.map((p) => ({ date: p.date, value: p.clicks })) });
  }
  if (vc && vc.ok && vc.analytics.ok) {
    const days = vc.analytics.days.slice(-range.days);
    flow.push({ key: "visitors", label: "방문자", kind: "count", total: `${fmtValue(sumOf(days.map((x) => x.visitors)), "count")}명`, points: days.map((x) => ({ date: x.date, value: x.visitors })) });
  }

  const exportJson = exportData(d);
  const urgent = actions.filter((a) => a.level === "bad").length;
  const check = actions.filter((a) => a.level === "warn").length;
  const wasted = effect.campaigns.filter((c) => c.verdict === "bad").length;

  const tabs: TabDef[] = [
    {
      id: "overview",
      label: "한눈에 보기",
      short: "한눈에",
      badge: urgent ? { text: `긴급 ${urgent}`, short: String(urgent), level: "bad" } : check ? { text: `확인 ${check}`, short: String(check), level: "warn" } : null,
      node: (
        <>
          <OverviewPanel o={overview} range={range} costPerEngaged={effectCostPerEngaged(effect)} flow={flow} />
          <ActionsPanel items={actions} />
        </>
      ),
    },
    {
      id: "effect",
      label: "광고 효과",
      short: "효과",
      badge: wasted ? { text: `낭비 ${wasted}`, short: String(wasted), level: "bad" } : null,
      node: <EffectPanel e={effect} range={range} data={exportJson} />,
    },
    {
      id: "money",
      label: "매출·사이트",
      short: "매출",
      node: (
        <>
          {rev && <RevenuePanel real={rev} ga={ga} range={range} />}
          {ga && <Ga4Panel g={ga} range={range} />}
          {vc && <VercelPanel v={vc} ga={ga} range={range} />}
          {!rev && !ga && !vc && <p className="note panel">매출·사이트 소스가 아직 연결되지 않았습니다. '연결' 탭을 확인하세요.</p>}
        </>
      ),
    },
    {
      id: "ads",
      label: "광고 상세",
      short: "광고",
      node: (
        <>
          {meta && <MetaPanel m={meta} range={range} />}
          {ads && <AdsPanel a={ads} ga={ga} range={range} />}
          {yt && <YoutubePanel y={yt} brand={brand} />}
          {!meta && !ads && !yt && <p className="note panel">광고 소스가 아직 연결되지 않았습니다. '연결' 탭을 확인하세요.</p>}
        </>
      ),
    },
  ];
  if (pending.length > 0) {
    tabs.push({
      id: "connect",
      label: "연결",
      short: "연결",
      badge: { text: String(pending.length), short: String(pending.length), level: "info" },
      node: (
        <>
          <h3 className="pending-title">연결이 필요한 플랫폼</h3>
          <section className="grid">
            {pending.map(({ platform, missing }) => (
              <article key={platform.id} className="card">
                <h2>{platform.label}</h2>
                <p className="state">연결 필요</p>
                <p className="note">{platform.note}</p>
                {platform.id === "youtube" && missing.length === 1 && missing[0].endsWith("_YOUTUBE_REFRESH_TOKEN") && (
                  <p>
                    <a className="connect" href={`/api/youtube/connect?brand=${brand}`}>
                      유튜브 연결하기
                    </a>
                    <span className="fine"> 구글 승인 후 refresh token을 한 번 보여 줍니다.</span>
                  </p>
                )}
                {platform.id === "reddit" && missing.length === 1 && missing[0].endsWith("_REDDIT_REFRESH_TOKEN") && (
                  <p>
                    <a className="connect" href={`/api/reddit/connect?brand=${brand}`}>
                      레딧 연결하기
                    </a>
                    <span className="fine"> 레딧 승인 후 refresh token을 한 번 보여 줍니다.</span>
                  </p>
                )}
                <p className="label">Vercel 환경변수에 필요:</p>
                <ul>
                  {missing.map((k) => (
                    <li key={k}>
                      <code>{k}</code>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        </>
      ),
    });
  }

  return (
    <main>
      <header>
        <h1>광고 모니터링</h1>
        <nav className="tabs" aria-label="브랜드">
          {BRANDS.map((b) => (
            <a key={b.id} href={`/?brand=${b.id}&${rangeQuery(range)}`} data-keep-hash className={b.id === brand ? "on" : ""}>
              {b.label}
            </a>
          ))}
        </nav>
      </header>
      <p className="sub">
        {d.connectedCount} / {d.statuses.length} 플랫폼 연결됨 · 수치는 약 10분 간격으로 갱신됩니다.
      </p>
      <RangePicker brand={brand} range={range} />
      {d.demo && <p className="demo">데모 데이터입니다. 실제 수치가 아닙니다.</p>}
      <ViewTabs tabs={tabs} />
    </main>
  );
}
