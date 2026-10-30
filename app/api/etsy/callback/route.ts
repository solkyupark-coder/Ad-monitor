// 엣시 콜백: state 확인 → code(+PKCE verifier)를 refresh token으로 교환 → 연결된 샵을 확인해 한 번만 보여 준다(저장·캐시·로그 없음).
import { NextRequest } from "next/server";
import { BRANDS } from "@/lib/platforms";
import { esc, oauthPage, tokenBox } from "@/lib/oauth-page";
import { isBrand } from "@/lib/reddit-oauth";
import { ETSY_STATE_COOKIE, etsyApiKey, etsyRedirectUri, exchangeEtsyCode } from "@/lib/etsy-oauth";

export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) => oauthPage(title, body, status, ETSY_STATE_COOKIE);

// 발급된 토큰으로 샵 이름을 확인한다(실패해도 토큰은 보여 준다).
async function shopName(accessToken: string): Promise<string | null> {
  const key = etsyApiKey();
  if (!key) return null;
  const h = { authorization: `Bearer ${accessToken}`, "x-api-key": key };
  const me = await fetch("https://api.etsy.com/v3/application/users/me", { headers: h, cache: "no-store" }).catch(() => null);
  const m = me && me.ok ? ((await me.json()) as { shop_id?: number | null }) : null;
  if (!m?.shop_id) return null;
  const s = await fetch(`https://api.etsy.com/v3/application/shops/${m.shop_id}`, { headers: h, cache: "no-store" }).catch(() => null);
  return s && s.ok ? ((await s.json()) as { shop_name?: string }).shop_name ?? null : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const error = sp.get("error");
  if (error) return page("엣시 연결이 취소됐습니다", `<p>엣시가 돌려준 사유: <code>${esc(error)}</code>${sp.get("error_description") ? ` — ${esc(sp.get("error_description")!)}` : ""}</p>`, 400);
  const code = sp.get("code");
  const state = sp.get("state");
  const [savedState, brand, verifier] = (req.cookies.get(ETSY_STATE_COOKIE)?.value ?? "").split(".");
  if (!code || !state || !savedState || !verifier || state !== savedState || !isBrand(brand ?? null)) {
    return page("엣시 연결을 확인할 수 없습니다", "<p>연결 요청이 만료됐거나 다른 창에서 시작됐습니다(10분 제한). 대시보드의 '엣시 연결하기'를 다시 눌러 주세요.</p>", 400);
  }
  const r = await exchangeEtsyCode(code, verifier, etsyRedirectUri(req.nextUrl.origin));
  if (!r.ok) return page("엣시 토큰 교환 실패", `<p>${esc(r.error)}</p>`, 502);
  const envName = `${BRANDS.find((b) => b.id === brand)!.prefix}_ETSY_REFRESH_TOKEN`;
  const shop = await shopName(r.accessToken);
  return page(
    "엣시 refresh token 발급 완료",
    `${shop ? `<p class="ok">연결된 샵: <b>${esc(shop)}</b></p>` : '<p class="warn">샵을 확인하지 못했습니다. 샵 주인 계정으로 승인했는지, ETSY_SHARED_SECRET이 들어 있는지 확인하세요.</p>'}
${tokenBox(envName, r.refreshToken)}
<p class="fine">엣시 refresh token은 발급 후 약 90일 쓸 수 있습니다. 그 뒤에는 대시보드에서 다시 연결하세요.</p>
<p class="warn">채팅이나 문서에 붙여넣지 마세요. 넣은 뒤 이 창을 닫으세요.</p>`,
  );
}
