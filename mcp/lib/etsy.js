// 엣시: 샵 설정 보기(배송·처리 프로필, 반품 정책), 카테고리 찾기, 상품 '초안' 만들기, 초안 공개(유료 게시).
// 초안(draft)은 손님에게 보이지 않고 엣시 수수료도 없다. 공개(active)하면 게시 수수료(상품당 0.20달러)가 붙으니 confirm=true + 사용자 확인이 필요하다.
// 토큰: ETSY_PUBLISH_TOKEN_{TOPO|HOUSCAPER} (listings_w, 대시보드 연결 탭의 '엣시 상품 등록 토큰'으로 발급), 앱 키: ETSY_KEYSTRING + ETSY_SHARED_SECRET.
import { BRAND_ENV, BRAND_NAME, env, fetchBytes, needBrand, readJson, UserError } from "./util.js";

const API = "https://api.etsy.com/v3/application";

function keys(brand) {
  const k = BRAND_ENV[brand];
  const missing = ["ETSY_KEYSTRING", "ETSY_SHARED_SECRET", `ETSY_PUBLISH_TOKEN_${k}`].filter((n) => !env(n));
  if (missing.length) throw new UserError(`${BRAND_NAME[brand]} 엣시 상품 등록 연결이 아직 안 됐습니다. ad-monitor-mcp 환경변수에 ${missing.join(", ")}를 넣고 재배포하세요(토큰은 대시보드 연결 탭 '엣시 상품 등록 토큰').`);
  return { apiKey: `${env("ETSY_KEYSTRING")}:${env("ETSY_SHARED_SECRET")}`, refresh: env(`ETSY_PUBLISH_TOKEN_${k}`) };
}

const cache = new Map();
async function auth(brand) {
  const { apiKey, refresh } = keys(brand);
  const hit = cache.get(refresh);
  if (hit && hit.until > Date.now()) return { apiKey, token: hit.token, shopId: hit.shopId };
  const r = await fetch(`${API.replace("/application", "")}/public/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: env("ETSY_KEYSTRING"), refresh_token: refresh }),
  });
  const j = await readJson(r);
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new UserError("엣시 상품 등록 토큰이 만료됐습니다(발급 후 90일). 대시보드 연결 탭에서 새로 받아 주세요.");
    throw new UserError(`엣시 토큰 갱신 실패(${j.error ?? r.status}).`);
  }
  const me = await fetch(`${API}/users/me`, { headers: { authorization: `Bearer ${j.access_token}`, "x-api-key": apiKey } });
  const mj = await readJson(me);
  if (!me.ok || !mj.shop_id) throw new UserError("연결한 엣시 계정에서 샵을 찾지 못했습니다. 샵 주인 계정으로 토큰을 다시 받으세요.");
  cache.set(refresh, { token: j.access_token, shopId: mj.shop_id, until: Date.now() + ((j.expires_in ?? 3600) - 300) * 1000 });
  return { apiKey, token: j.access_token, shopId: mj.shop_id };
}

async function call(brand, path, init = {}) {
  const a = await auth(brand);
  const r = await fetch(`${API}${path.replace("{shop}", a.shopId)}`, { ...init, headers: { authorization: `Bearer ${a.token}`, "x-api-key": a.apiKey, ...(init.headers ?? {}) } });
  return { r, j: await readJson(r), shopId: a.shopId };
}

const etsyErr = (j, status) => (j?.error ? `${j.error}${j.error_description ? `: ${j.error_description}` : ""}` : `HTTP ${status}`);

export async function etsyShopInfo({ brand }) {
  needBrand(brand);
  const [shop, ship, ready, ret, sections] = await Promise.all([
    call(brand, "/shops/{shop}"),
    call(brand, "/shops/{shop}/shipping-profiles"),
    call(brand, "/shops/{shop}/readiness-state-definitions?limit=100"),
    call(brand, "/shops/{shop}/policies/return"),
    call(brand, "/shops/{shop}/sections"),
  ]);
  if (!shop.r.ok) throw new UserError(`샵 조회 실패: ${etsyErr(shop.j, shop.r.status)}`);
  const L = [`샵: ${shop.j.shop_name} (shop_id ${shop.shopId}) · 통화 ${shop.j.currency_code} · 판매 중 ${shop.j.listing_active_count ?? "?"}개`];
  const sp = ship.j?.results ?? [];
  L.push(sp.length ? `배송 프로필(shipping_profile_id): ${sp.map((p) => `${p.title} = ${p.shipping_profile_id}`).join(" | ")}` : "배송 프로필 없음 — 실물 상품을 올리려면 Shop Manager에서 먼저 만드세요(디지털 상품은 필요 없음).");
  const rs = ready.j?.results ?? [];
  if (rs.length) L.push(`처리 기간 프로필(readiness_state_id): ${rs.map((p) => `${p.readiness_state ?? ""} ${p.min_processing_time ?? "?"}~${p.max_processing_time ?? "?"}${p.processing_time_unit ? ` ${p.processing_time_unit}` : "일"} = ${p.readiness_state_id ?? p.id}`).join(" | ")}`);
  const rp = ret.j?.results ?? [];
  if (rp.length) L.push(`반품 정책(return_policy_id): ${rp.map((p) => `${p.accepts_returns ? `반품 ${p.return_deadline ?? "?"}일` : "반품 안 받음"} = ${p.return_policy_id}`).join(" | ")}`);
  const ss = sections.j?.results ?? [];
  if (ss.length) L.push(`섹션(shop_section_id): ${ss.map((s) => `${s.title} = ${s.shop_section_id}`).join(" | ")}`);
  return L.join("\n");
}

let taxonomy = null;
export async function etsyFindCategory({ brand, query }) {
  needBrand(brand);
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) throw new UserError("query를 주세요(예: laser cut, dollhouse, svg).");
  if (!taxonomy) {
    const { r, j } = await call(brand, "/seller-taxonomy/nodes");
    if (!r.ok) throw new UserError(`카테고리 목록 조회 실패: ${etsyErr(j, r.status)}`);
    const flat = [];
    const walk = (nodes, path) => {
      for (const n of nodes ?? []) {
        const p = [...path, n.name];
        flat.push({ id: n.id, path: p.join(" > ") });
        walk(n.children, p);
      }
    };
    walk(j.results, []);
    taxonomy = flat;
  }
  const words = q.split(/\s+/);
  const hits = taxonomy.filter((t) => words.every((w) => t.path.toLowerCase().includes(w))).slice(0, 25);
  if (!hits.length) return `"${query}"에 맞는 카테고리가 없습니다. 더 짧은 영어 단어로 찾아 보세요.`;
  return hits.map((h) => `${h.id} — ${h.path}`).join("\n");
}

const csv = (xs) => (Array.isArray(xs) ? xs : xs ? String(xs).split(",") : []).map((x) => String(x).trim()).filter(Boolean);

export async function etsyCreateDraftListing(a) {
  needBrand(a.brand);
  const title = String(a.title ?? "").trim();
  const description = String(a.description ?? "").trim();
  const price = Number(a.price);
  if (!title || !description) throw new UserError("title과 description이 필요합니다.");
  if (title.length > 140) throw new UserError("엣시 제목은 140자까지입니다.");
  if (!(price > 0)) throw new UserError("price는 0보다 큰 숫자(샵 통화 기준)여야 합니다.");
  if (!a.taxonomy_id) throw new UserError("taxonomy_id가 필요합니다. etsy_find_category로 찾으세요.");
  const type = a.type === "download" ? "download" : a.type === "both" ? "both" : "physical";
  if (type !== "download" && !a.shipping_profile_id) throw new UserError("실물 상품은 shipping_profile_id가 필요합니다. etsy_shop_info로 확인하세요(디지털 파일이면 type='download').");
  const tags = csv(a.tags);
  if (tags.length > 13) throw new UserError("태그는 13개까지입니다.");
  if (tags.some((t) => t.length > 20)) throw new UserError("태그 하나는 20자까지입니다.");
  const images = csv(a.image_urls);
  if (!images.length) throw new UserError("image_urls에 상품 사진 주소를 1장 이상 주세요(공개하려면 사진이 필요합니다).");
  if (images.length > 10) throw new UserError("사진은 10장까지입니다.");

  const form = new URLSearchParams({
    quantity: String(Math.max(1, Math.floor(Number(a.quantity) || (type === "download" ? 999 : 1)))),
    title,
    description,
    price: price.toFixed(2),
    who_made: a.who_made || "i_did",
    when_made: a.when_made || "made_to_order",
    taxonomy_id: String(a.taxonomy_id),
    type,
    is_supply: a.is_supply ? "true" : "false",
    should_auto_renew: "false",
  });
  if (tags.length) form.set("tags", tags.join(","));
  const materials = csv(a.materials);
  if (materials.length) form.set("materials", materials.join(","));
  for (const k of ["shipping_profile_id", "return_policy_id", "readiness_state_id", "shop_section_id"]) if (a[k]) form.set(k, String(a[k]));

  const created = await call(a.brand, "/shops/{shop}/listings", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
  if (!created.r.ok || !created.j.listing_id) throw new UserError(`초안 만들기 실패: ${etsyErr(created.j, created.r.status)}`);
  const id = created.j.listing_id;
  const notes = [];
  for (let i = 0; i < images.length; i++) {
    try {
      const img = await fetchBytes(images[i], { limit: 20 * 1024 * 1024, kind: "사진" });
      const fd = new FormData();
      fd.append("image", new Blob([img.bytes], { type: img.type.startsWith("image/") ? img.type : "image/jpeg" }), img.name || `photo-${i + 1}.jpg`);
      fd.append("rank", String(i + 1));
      const up = await call(a.brand, `/shops/{shop}/listings/${id}/images`, { method: "POST", body: fd });
      if (!up.r.ok) notes.push(`사진 ${i + 1} 실패: ${etsyErr(up.j, up.r.status)}`);
    } catch (e) {
      notes.push(`사진 ${i + 1} 실패: ${e.message}`);
    }
  }
  if (a.digital_file_url) {
    try {
      const f = await fetchBytes(a.digital_file_url, { limit: 20 * 1024 * 1024, kind: "파일" });
      const fd = new FormData();
      const name = String(a.digital_file_name || f.name || "file.zip");
      fd.append("file", new Blob([f.bytes], { type: f.type }), name);
      fd.append("name", name);
      const up = await call(a.brand, `/shops/{shop}/listings/${id}/files`, { method: "POST", body: fd });
      if (!up.r.ok) notes.push(`디지털 파일 실패: ${etsyErr(up.j, up.r.status)}`);
    } catch (e) {
      notes.push(`디지털 파일 실패: ${e.message}`);
    }
  }
  return [
    `${BRAND_NAME[a.brand]} 엣시 샵에 초안을 만들었습니다(아직 손님에게 안 보임, 수수료 없음).`,
    `listing_id: ${id}`,
    `확인: https://www.etsy.com/your/shops/me/listing-editor/edit/${id}`,
    ...notes.map((n) => `⚠ ${n}`),
    "사용자가 초안을 확인하면 etsy_publish_listing(listing_id, confirm=true)로 공개합니다(게시 수수료 0.20달러).",
  ].join("\n");
}

export async function etsyPublishListing({ brand, listing_id, confirm }) {
  needBrand(brand);
  if (!/^\d+$/.test(String(listing_id ?? ""))) throw new UserError("listing_id가 올바르지 않습니다.");
  const cur = await call(brand, `/listings/${listing_id}?includes=Images`);
  if (!cur.r.ok) throw new UserError(`상품 조회 실패: ${etsyErr(cur.j, cur.r.status)}`);
  const l = cur.j;
  const summary = `「${l.title}」 · ${l.price ? `${l.price.amount / l.price.divisor} ${l.price.currency_code}` : "?"} · 상태 ${l.state} · 사진 ${l.images?.length ?? "?"}장`;
  if (l.state === "active") return `이미 공개된 상품입니다: ${summary}\n${l.url ?? ""}`;
  if (confirm !== true) return `공개 전 확인: ${summary}\n공개하면 손님에게 보이고 게시 수수료(0.20달러, 4개월)가 붙습니다. 사용자가 확인하면 confirm=true로 다시 부르세요.`;
  const up = await call(brand, `/shops/{shop}/listings/${listing_id}`, { method: "PATCH", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ state: "active" }) });
  if (!up.r.ok) throw new UserError(`공개 실패: ${etsyErr(up.j, up.r.status)} — 사진·배송 프로필·처리 기간이 있는지 확인하세요.`);
  return `공개했습니다: ${summary.replace(/상태 \w+/, "상태 active")}\n${up.j.url ?? l.url ?? ""}`;
}
