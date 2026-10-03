export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = Boolean(process.env.DASHBOARD_PASSWORD);
  return (
    <main className="login">
      <h1>광고 모니터링</h1>
      {!configured ? (
        <p className="warn">Vercel 환경변수 <code>DASHBOARD_PASSWORD</code>를 설정하면 로그인할 수 있습니다.</p>
      ) : (
        <form method="post" action="/api/login">
          <input type="password" name="password" placeholder="비밀번호" autoFocus required />
          <button type="submit">들어가기</button>
          {error && <p className="warn">비밀번호가 맞지 않습니다.</p>}
        </form>
      )}
    </main>
  );
}
