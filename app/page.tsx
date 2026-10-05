import { BRANDS, statusFor, type BrandId, type PlatformId } from "@/lib/platforms";
import { youtubeSummary, type YoutubeSummary } from "@/lib/youtube";
import { metaSummary, weekSplit, type MetaSummary } from "@/lib/meta";
import { ga4Summary } from "@/lib/ga4";
import { googleAdsSummary } from "@/lib/googleads";
import { revenueSummary } from "@/lib/revenue";
import { demoAds, demoGa4, demoMeta, demoOn, demoRevenue, demoYoutube } from "@/lib/demo";
import { fmtCompact, fmtDate, fmtValue } from "@/lib/format";
import { TrendChart } from "@/components/TrendChart";
import { BarList, Delta, Stat } from "@/components/ui";
import { AdsPanel, Ga4Panel, RevenuePanel } from "@/components/panels";

export const dynamic = "force-dynamic";

function MetaPanel({ m }: { m: MetaSummary }) {
  if (!m.ok) {
    return (
      <section className="panel">
        <h2>메타 광고</h2>
        <p className="note">{m.reason}</p>
      </section>
    );
  }
  const { cur, prev } = weekSplit(m.days);
  const last7 = m.days.slice(-7);
  const period = last7.length ? `${fmtDate(last7[0].date)} – ${fmtDate(last7[last7.length - 1].date)}` : "";
  const maxSpend = Math.max(...m.campaigns.map((c) => c.spend), 1);
  const cur$ = (n: number) => fmtValue(n, "won", m.currency);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>메타 광고</h2>
        <p className="meta">
          {m.accountName} · 최근 7일 {period} (어제까지)
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
      <div className="charts">
        <div>
          <h3>일별 지출</h3>
          <TrendChart points={m.days.map((d) => ({ date: d.date, value: d.spend }))} kind="won" currency={m.currency} color="s1" name="지출" />
        </div>
        <div>
          <h3>일별 클릭</h3>
          <TrendChart points={m.days.map((d) => ({ date: d.date, value: d.clicks }))} kind="count" color="s2" name="클릭" />
        </div>
      </div>
      {m.campaigns.length > 0 && (
        <>
          <h3>캠페인별 (최근 7일, 지출 순)</h3>
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
                {m.campaigns.slice(0, 8).map((c) => (
                  <tr key={c.name}>
                    <td className="name" title={c.name}>
                      {c.name}
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
                ))}
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

export default async function Home({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand: q } = await searchParams;
  const brand: BrandId = BRANDS.some((b) => b.id === q) ? (q as BrandId) : "houscaper";
  const demo = demoOn();
  const statuses = statusFor(brand);
  const DEMO_ON: PlatformId[] = ["meta", "youtube", "ga4", "revenue", "google_ads"];
  const isOn = (id: PlatformId) => (demo ? DEMO_ON.includes(id) : statuses.find((s) => s.platform.id === id)?.connected);
  const [meta, yt, ga, rev, ads] = await Promise.all([
    isOn("meta") ? (demo ? demoMeta() : metaSummary(brand)) : null,
    isOn("youtube") ? (demo ? demoYoutube() : youtubeSummary(brand)) : null,
    isOn("ga4") ? (demo ? demoGa4() : ga4Summary(brand)) : null,
    isOn("revenue") ? (demo ? demoRevenue() : revenueSummary(brand)) : null,
    isOn("google_ads") ? (demo ? demoAds() : googleAdsSummary(brand)) : null,
  ]);
  const connectedCount = statuses.filter((s) => isOn(s.platform.id)).length;
  const pending = statuses.filter((s) => !isOn(s.platform.id));
  return (
    <main>
      <header>
        <h1>광고 모니터링</h1>
        <nav className="tabs">
          {BRANDS.map((b) => (
            <a key={b.id} href={`/?brand=${b.id}`} className={b.id === brand ? "on" : ""}>
              {b.label}
            </a>
          ))}
        </nav>
      </header>
      <p className="sub">
        {connectedCount} / {statuses.length} 플랫폼 연결됨 · 수치는 약 10분 간격으로 갱신됩니다.
      </p>
      {demo && <p className="demo">데모 데이터입니다. 실제 수치가 아닙니다.</p>}
      {rev && <RevenuePanel real={rev} ga={ga} />}
      {ga && <Ga4Panel g={ga} />}
      {meta && <MetaPanel m={meta} />}
      {ads && <AdsPanel a={ads} ga={ga} />}
      {yt && <YoutubePanel y={yt} brand={brand} />}
      {pending.length > 0 && (
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
      )}
    </main>
  );
}
