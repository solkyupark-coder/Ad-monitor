import { BRANDS, statusFor, type BrandId } from "@/lib/platforms";
import { youtubeSummary } from "@/lib/youtube";
import { metaSummary } from "@/lib/meta";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand: q } = await searchParams;
  const brand: BrandId = BRANDS.some((b) => b.id === q) ? (q as BrandId) : "houscaper";
  const statuses = statusFor(brand);
  const yt = statuses.find((s) => s.platform.id === "youtube")?.connected ? await youtubeSummary(brand) : null;
  const meta = statuses.find((s) => s.platform.id === "meta")?.connected ? await metaSummary(brand) : null;
  const connected = statuses.filter((s) => s.connected).length;
  return (
    <main>
      <header>
        <h1>광고 모니터링</h1>
        <nav className="tabs">
          {BRANDS.map((b) => (
            <a key={b.id} href={`/?brand=${b.id}`} className={b.id === brand ? "on" : ""}>{b.label}</a>
          ))}
        </nav>
      </header>
      <p className="sub">{connected} / {statuses.length} 플랫폼 연결됨 · 연결되면 성과 지표가 이 카드에 표시됩니다.</p>
      <section className="grid">
        {statuses.map(({ platform, missing, connected: ok }) => (
          <article key={platform.id} className={ok ? "card ok" : "card"}>
            <h2>{platform.label}</h2>
            <p className="state">{ok ? "연결됨" : "연결 필요"}</p>
            {!ok && (
              <>
                <p className="note">{platform.note}</p>
                <p className="label">Vercel 환경변수에 필요:</p>
                <ul>{missing.map((k) => <li key={k}><code>{k}</code></li>)}</ul>
              </>
            )}
            {ok && platform.id === "meta" && meta && (
              meta.ok ? (
                <>
                  <p className="label">{meta.accountName} · 최근 7일</p>
                  <ul>
                    <li>지출 {meta.spend.toLocaleString("ko-KR")} {meta.currency}</li>
                    <li>노출 {meta.impressions.toLocaleString("ko-KR")}</li>
                    <li>클릭 {meta.clicks.toLocaleString("ko-KR")}</li>
                  </ul>
                </>
              ) : <p className="note">{meta.reason}</p>
            )}
            {ok && platform.id === "youtube" && yt && (
              yt.ok ? (
                <>
                  <p className="label">{yt.channelTitle} · 구독자 {yt.subscribers == null ? "비공개" : yt.subscribers.toLocaleString("ko-KR")}</p>
                  <p className="label">최근 영상 조회수</p>
                  <ul>{yt.videos.map((v) => <li key={v.id}>{v.title} — {v.views.toLocaleString("ko-KR")}</li>)}</ul>
                </>
              ) : <p className="note">{yt.reason}</p>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
