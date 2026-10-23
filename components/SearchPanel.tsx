// '검색' 탭: 구글 검색(Search Console) + 검색으로 온 방문이 한 일(GA4) + 유튜브 검색. 전문 용어 대신 쉬운 말로 쓴다.
import type { BrandId } from "@/lib/platforms";
import type { SearchSummary } from "@/lib/searchconsole";
import type { YoutubeSummary } from "@/lib/youtube";
import type { DateRange } from "@/lib/range";
import { fmtDate, fmtValue } from "@/lib/format";
import { TrendChart } from "@/components/TrendChart";
import { BarList, Delta, Stat } from "@/components/ui";
import { LevelIcon } from "@/components/icons";

const n = (v: number) => fmtValue(v, "count");
const pct = (v: number) => `${Math.round(v * 100)}%`;

// 숫자를 보고 바로 알 수 있게 한두 문장으로 요약한다.
function summaryLines(s: Extract<SearchSummary, { ok: true }>, range: DateRange): string[] {
  const out: string[] = [];
  const { cur } = s;
  if (!cur.impressions) {
    out.push(`${range.label} 동안 구글 검색 결과에 한 번도 안 보였어요. 아직 구글이 사이트를 거의 모르는 상태예요.`);
  } else {
    out.push(`${range.label} 동안 구글 검색 결과에 ${n(cur.impressions)}번 보였고, ${n(cur.clicks)}번 눌려서 사이트로 들어왔어요.`);
    if (s.brandShare && s.brandShare.impressions >= 0.5)
      out.push(`보인 것 중 ${pct(s.brandShare.impressions)}는 브랜드 이름을 직접 검색한 경우예요. 이름을 모르는 사람은 아직 검색으로 거의 못 찾고 있어요.`);
    else if (s.brandShare) out.push(`보인 것 중 ${pct(1 - s.brandShare.impressions)}는 브랜드 이름이 아닌 일반 검색어예요. 이름을 모르는 사람도 검색으로 찾아오기 시작했어요.`);
    if (cur.position > 10) out.push(`평균 ${cur.position.toFixed(0)}위라 대부분 검색 결과 2페이지 이후에 있어요(1페이지는 1~10위).`);
  }
  if (s.checks) {
    const bad = s.checks.filter((c) => c.state === "warn").length;
    const out_ = s.checks.filter((c) => c.state === "out").length;
    const inn = s.checks.length - bad - out_;
    out.push(`확인한 페이지 ${s.checks.length}개 중 ${inn}개는 구글 검색에 나오고, ${out_ + bad}개는 아직 안 나와요${bad ? ` (그중 ${bad}개는 사이트 쪽에서 고쳐야 해요)` : ""}.`);
  }
  if (s.organic && s.organic.sessions) {
    const ev = s.organic.events.map((e) => `${e.label} ${n(e.count)}번`).join(", ");
    out.push(`검색으로 들어온 방문은 ${n(s.organic.sessions)}번이고, ${ev ? `그 방문에서 ${ev}이 있었어요.` : "그 방문에서 가입·결제는 아직 없어요."}`);
  }
  return out;
}

function ConnectBox({ brand, reason }: { brand: BrandId; reason: string }) {
  return (
    <>
      <p className="note">{reason}</p>
      <ol className="steps">
        <li>
          <a className="connect" href={`/api/youtube/connect?brand=${brand}&mode=search`}>
            구글 검색 연결하기
          </a>{" "}
          를 누르고, 사이트를 Search Console에 등록한 구글 계정을 고르세요.
        </li>
        <li>끝나면 나오는 화면의 값을 Vercel 환경변수에 넣고 재배포(Redeploy)하세요. 화면에 넣을 이름이 적혀 있어요.</li>
        <li>처음 한 번만: Google Cloud에서 &apos;Google Search Console API&apos; 사용 설정이 필요해요(유튜브 분석 API를 켰던 곳과 같은 프로젝트).</li>
      </ol>
    </>
  );
}

function YoutubeSearch({ y, range }: { y: YoutubeSummary | null; range: DateRange }) {
  if (!y || !y.ok || !y.analytics || !y.analytics.ok) return null;
  const a = y.analytics;
  const total = a.cur.views;
  const ytSearch = a.sources?.find((s) => s.type === "YT_SEARCH")?.views ?? 0;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>유튜브 검색</h2>
        <p className="meta">
          {y.channelTitle} · {range.label}
        </p>
      </div>
      <p className="lead">
        {total
          ? `유튜브 조회 ${n(total)}회 중 ${n(ytSearch)}회(${pct(total ? ytSearch / total : 0)})가 유튜브에서 검색해서 본 거예요.`
          : "이 기간 유튜브 조회 수치가 아직 없어요(보통 2~3일 늦게 들어와요)."}
      </p>
      {a.sources && a.sources.length > 0 && (
        <>
          <h3>조회가 어디서 왔나</h3>
          <BarList color="s1" items={a.sources.slice(0, 8).map((s) => ({ id: s.type, label: s.label, value: s.views, display: `${n(s.views)}회`, note: `${pct(total ? s.views / total : 0)}` }))} />
        </>
      )}
      {a.searchTerms && a.searchTerms.length > 0 && (
        <>
          <h3>유튜브에서 이렇게 검색해서 봤어요</h3>
          <BarList color="s2" items={a.searchTerms.map((t) => ({ id: t.term, label: t.term, value: t.views, display: `${n(t.views)}회`, note: "유튜브 검색어" }))} />
        </>
      )}
    </section>
  );
}

export function SearchPanel({ s, y, brand, range }: { s: SearchSummary; y: YoutubeSummary | null; brand: BrandId; range: DateRange }) {
  if (!s.ok) {
    return (
      <>
        <section className="panel">
          <h2>구글 검색</h2>
          {s.reconnect ? <ConnectBox brand={brand} reason={s.reason} /> : <p className="note">{s.reason}</p>}
        </section>
        <YoutubeSearch y={y} range={range} />
      </>
    );
  }
  const { cur, prev } = s;
  const lag = s.lastDate && s.lastDate < range.to ? `구글 검색 수치는 ${fmtDate(s.lastDate)}까지 들어왔어요(보통 2~3일 늦음)` : "";
  const maxQ = Math.max(...s.queries.map((q) => q.impressions), 1);
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>구글 검색</h2>
          <p className="meta">
            {s.site.replace(/^sc-domain:/, "")} · {range.label}
            {lag && <span className="fine"> · {lag}</span>}
          </p>
        </div>
        <div className="summary-box">
          {summaryLines(s, range).map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div className="kpis">
          <Stat label="검색 결과에 보인 횟수" value={cur.impressions} kind="count" hero>
            <Delta cur={cur.impressions} prev={prev?.impressions ?? null} goodWhen="up" />
          </Stat>
          <Stat label="눌러서 들어온 수" value={cur.clicks} kind="count">
            <Delta cur={cur.clicks} prev={prev?.clicks ?? null} goodWhen="up" />
          </Stat>
          <Stat label="보고 누른 비율" value={cur.impressions ? `${(cur.ctr * 100).toFixed(1)}%` : "-"} />
          <Stat label="평균 순위 (1이 맨 위)" value={cur.position ? `${cur.position.toFixed(1)}위` : "-"}>
            {prev && prev.position > 0 && cur.position > 0 && (
              <span className={`delta ${cur.position < prev.position ? "good" : cur.position > prev.position ? "bad" : "flat"}`}>
                직전 기간 {prev.position.toFixed(1)}위
              </span>
            )}
          </Stat>
          {s.organic && (
            <Stat label="검색으로 온 방문" value={s.organic.sessions} kind="count">
              <span className="delta flat">{s.organic.events.length ? s.organic.events.map((e) => `${e.label} ${n(e.count)}`).join(" · ") : "가입·결제 없음"}</span>
            </Stat>
          )}
        </div>
        {s.days.length > 1 && (
          <div className="charts">
            <div>
              <h3>일별 검색 결과에 보인 횟수</h3>
              <TrendChart points={s.days.map((d) => ({ date: d.date, value: d.impressions }))} kind="count" color="s1" name="보인 횟수" />
            </div>
            <div>
              <h3>일별 눌러서 들어온 수</h3>
              <TrendChart points={s.days.map((d) => ({ date: d.date, value: d.clicks }))} kind="count" color="s2" name="들어온 수" />
            </div>
          </div>
        )}
        {s.checks && (
          <>
            <h3>페이지가 구글 검색에 나오나요?</h3>
            <ul className="acct-list">
              {s.checks.map((c) => (
                <li key={c.url} className={c.state === "warn" ? "bad" : ""}>
                  <span className="acct-name">
                    <a href={c.url} target="_blank" rel="noreferrer">
                      <strong>{c.path}</strong>
                    </a>
                    {c.lastCrawl && <span className="fine-inline">구글이 마지막으로 본 날 {fmtDate(c.lastCrawl)}</span>}
                  </span>
                  <span className={`acct-val ${c.state === "warn" ? "bad" : ""}`}>
                    <LevelIcon level={c.state === "in" ? "good" : c.state === "warn" ? "bad" : "hold"} size={11} /> {c.text}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {s.checksNote && <p className="fine">{s.checksNote}</p>}
        {s.queries.length > 0 && (
          <>
            <h3>어떤 검색어에서 보였나</h3>
            <div className="scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>검색어</th>
                    <th>보인 횟수</th>
                    <th className="num">들어온 수</th>
                    <th className="num">순위</th>
                  </tr>
                </thead>
                <tbody>
                  {s.queries.map((q) => (
                    <tr key={q.key}>
                      <td className="name wrap">
                        <span className="nm">{q.key}</span>
                        {q.brand && (
                          <span className="tags">
                            <span className="vchip hold">브랜드 이름</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="inline-bar">
                          <span style={{ width: `${(q.impressions / maxQ) * 100}%` }} />
                        </span>
                        <span className="num">{n(q.impressions)}</span>
                      </td>
                      <td className="num">{n(q.clicks)}</td>
                      <td className="num">{q.position.toFixed(0)}위</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fine">검색한 사람이 아주 적은 검색어는 구글이 개인정보 때문에 보여 주지 않아서, 표의 합이 위 숫자보다 작을 수 있어요.</p>
          </>
        )}
        {s.pages.length > 0 && (
          <>
            <h3>검색 결과에 보인 페이지</h3>
            <BarList color="s1" items={s.pages.map((p) => ({ id: p.key, label: p.key, value: p.impressions, display: `${n(p.impressions)}번`, note: `들어온 수 ${n(p.clicks)} · 평균 ${p.position.toFixed(0)}위` }))} />
          </>
        )}
      </section>
      <YoutubeSearch y={y} range={range} />
    </>
  );
}
