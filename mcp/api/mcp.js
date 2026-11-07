// MCP 서버(Streamable HTTP, JSON 응답) — ad-monitor·토포제네시스·하우스케이퍼 프로젝트가 함께 쓴다.
// 주소: /m/<MCP_KEY> (모든 도구) · /m/open (읽기 도구만: get_daily_status, get_metrics, read_messages)
// - 일일 상황·세부 수치: Edge Config("status", "metrics") — ad-monitor가 매일 씀
// - 메시지 보드: 비공개 Vercel Blob(messages/)
// - 게시: 인스타 릴스, 유튜브, 레딧, 엣시(초안), 틱톡(초안함/바로 게시). 실제 공개는 게시물마다 사용자 확인 뒤에만.
// 소스는 Ad-monitor 저장소의 mcp/ 폴더에 있다(이전에는 배포 파일로만 있었음).
import { timingSafeEqual } from "node:crypto";
import { dailyStatus, metrics, postMessage, readMessages } from "../lib/board.js";
import { postReel, publishReel, uploadVideoFromUrl, uploadYoutube } from "../lib/social-video.js";
import { redditCheckSubreddit, redditMyPosts, redditSubmitPost } from "../lib/reddit.js";
import { etsyCreateDraftListing, etsyFindCategory, etsyPublishListing, etsyShopInfo } from "../lib/etsy.js";
import { tiktokPostStatus, tiktokUploadVideo } from "../lib/tiktok.js";
import { UserError } from "../lib/util.js";

const VERSION = "2.0.0";
const INSTRUCTIONS =
  "ad-monitor·토포제네시스·하우스케이퍼 프로젝트가 함께 쓰는 서버입니다. 일일 상황과 세부 수치는 매일 08:52 KST에 갱신됩니다. 프로젝트끼리 post_message/read_messages로 메시지를 주고받고, upload_video_from_url로 영상을 올려 주소를 받고, post_reel/publish_reel로 브랜드 인스타그램에 릴스를, upload_youtube_video로 유튜브에, reddit_submit_post로 레딧에, etsy_create_draft_listing으로 엣시 상품 초안을, tiktok_upload_video로 틱톡에 올립니다. 공개 게시는 게시물마다 사용자 확인 후에만 합니다(레딧·엣시 공개·틱톡 바로 게시는 confirm=true가 있어야 실제로 실행).";

const brandAll = { type: "string", enum: ["topo", "houscaper", "all"], description: "topo=토포제네시스, houscaper=하우스케이퍼, all=전체 (기본값)" };
const brand2 = (d = "브랜드") => ({ type: "string", enum: ["topo", "houscaper"], description: d });
const RO = { readOnlyHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

const TOOLS = [
  { open: true, name: "get_daily_status", description: "ad-monitor 프로젝트의 오늘 상황(배포 상태, 유튜브, GA4 요약, 할 일)을 가져옵니다. brand를 주면 그 브랜드 부분만 돌려줍니다.", inputSchema: { type: "object", properties: { brand: brandAll } }, annotations: RO, run: (a) => dailyStatus(a.brand ?? "all") },
  { open: true, name: "get_metrics", description: "브랜드별 세부 수치(GA4 유입 채널별 세션·참여율·핵심 이벤트, 퍼널, 유튜브 기간 지표, 엣시 주문, 레딧 글·광고, 틱톡 영상)를 표 형태로 가져옵니다.", inputSchema: { type: "object", properties: { brand: brandAll } }, annotations: RO, run: (a) => metrics(a.brand ?? "all") },
  {
    open: true,
    name: "read_messages",
    description: "이 프로젝트에 온 메시지(전체 공지 포함)를 최신순으로 읽습니다.",
    inputSchema: { type: "object", required: ["for"], properties: { for: { type: "string", enum: ["ad-monitor", "topo", "houscaper"], description: "읽는 프로젝트" }, limit: { type: "integer", minimum: 1, maximum: 50, description: "최대 개수 (기본 20)" }, since: { type: "string", description: "이 시각(ISO 8601) 이후 메시지만. 생략하면 최근 것" } } },
    annotations: RO,
    run: readMessages,
  },
  {
    name: "post_message",
    description: "다른 프로젝트(ad-monitor, 토포제네시스, 하우스케이퍼)에 메시지를 남깁니다. 요청, 공유, 질문을 남기면 받는 프로젝트가 read_messages로 읽습니다.",
    inputSchema: { type: "object", required: ["from", "to", "text"], properties: { from: { type: "string", enum: ["ad-monitor", "topo", "houscaper"], description: "보내는 프로젝트" }, to: { type: "string", enum: ["ad-monitor", "topo", "houscaper", "all"], description: "받는 프로젝트" }, text: { type: "string", maxLength: 4000, description: "메시지 내용" } } },
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: postMessage,
  },
  {
    name: "upload_video_from_url",
    description: "영상(MP4)을 공개 저장소에 올리고 post_reel에 넣을 수 있는 공개 주소를 돌려줍니다. source_url은 내려받을 수 있는 https 주소이고, 구글 드라이브 '링크가 있는 모든 사용자' 공유 링크도 됩니다. 100MB까지.",
    inputSchema: { type: "object", required: ["source_url"], properties: { source_url: { type: "string", description: "영상 https 주소 또는 구글 드라이브 공유 링크" }, name: { type: "string", maxLength: 80, description: "파일 이름(선택, 예: topo-reel-01)" } } },
    annotations: WRITE,
    run: uploadVideoFromUrl,
  },
  {
    name: "post_reel",
    description: "브랜드 인스타그램에 릴스를 올립니다. 공개 MP4 주소(video_url)와 캡션을 주면 업로드를 시작하고 container_id를 돌려줍니다. 이어서 publish_reel로 게시합니다. 실제로 공개 게시되니 사용자가 영상과 캡션을 확인한 뒤에만 부르세요.",
    inputSchema: { type: "object", required: ["brand", "video_url"], properties: { brand: brand2("올릴 브랜드 계정"), video_url: { type: "string", description: "공개적으로 내려받을 수 있는 MP4 주소" }, caption: { type: "string", maxLength: 2200, description: "캡션(해시태그 포함)" } } },
    annotations: WRITE,
    run: postReel,
  },
  {
    name: "publish_reel",
    description: "post_reel이 돌려준 container_id의 처리 상태를 확인하고, 준비되면 게시합니다. '처리 중'이면 몇 초 뒤 다시 부르세요.",
    inputSchema: { type: "object", required: ["brand", "container_id"], properties: { brand: brand2(), container_id: { type: "string" } } },
    annotations: WRITE,
    run: publishReel,
  },
  {
    name: "upload_youtube_video",
    description: "영상을 브랜드 유튜브 채널에 올립니다. source_url은 내려받을 수 있는 https 주소나 구글 드라이브 공유 링크(100MB까지). 기본은 비공개(private)로 올리고, unlisted/public은 사용자가 그 영상과 공개 범위를 확인한 뒤에만 고르세요.",
    inputSchema: { type: "object", required: ["brand", "source_url", "title"], properties: { brand: brand2("올릴 채널"), source_url: { type: "string", description: "영상 https 주소 또는 구글 드라이브 공유 링크" }, title: { type: "string", maxLength: 100 }, description: { type: "string", maxLength: 5000 }, privacy: { type: "string", enum: ["private", "unlisted", "public"], description: "기본 private" } } },
    annotations: WRITE,
    run: uploadYoutube,
  },
  {
    name: "reddit_check_subreddit",
    description: "글을 올리기 전에 서브레딧 규칙, 허용 글 종류(텍스트/링크), 필수 플레어(flair_id 목록), 제목·도메인 제한을 확인합니다. 읽기만 합니다.",
    inputSchema: { type: "object", required: ["brand", "subreddit"], properties: { brand: brand2("확인에 쓸 브랜드 레딧 계정"), subreddit: { type: "string", description: "서브레딧 이름(예: lasercutting, r/architecture)" } } },
    annotations: RO,
    run: redditCheckSubreddit,
  },
  {
    name: "reddit_submit_post",
    description:
      "브랜드 레딧 계정으로 서브레딧에 글을 올립니다. text를 주면 텍스트 글, url을 주면 링크 글. 레딧에는 초안 기능이 없어서, confirm을 빼면 미리보기와 규칙 점검만 돌려주고 올리지 않습니다. 사용자가 그 글·서브레딧을 확인한 뒤에만 confirm=true로 다시 부르세요(실제로 공개 게시됨).",
    inputSchema: {
      type: "object",
      required: ["brand", "subreddit", "title"],
      properties: {
        brand: brand2("올릴 브랜드 레딧 계정"),
        subreddit: { type: "string" },
        title: { type: "string", maxLength: 300 },
        text: { type: "string", maxLength: 40000, description: "텍스트 글 본문(마크다운)" },
        url: { type: "string", description: "링크 글 주소(주면 링크 글)" },
        flair_id: { type: "string", description: "reddit_check_subreddit이 알려 준 플레어 ID" },
        nsfw: { type: "boolean" },
        confirm: { type: "boolean", description: "true일 때만 실제로 올림. 사용자 확인 후에만" },
      },
    },
    annotations: WRITE,
    run: redditSubmitPost,
  },
  {
    name: "reddit_my_posts",
    description: "브랜드 레딧 계정이 최근 올린 글의 점수·댓글·삭제 여부를 봅니다.",
    inputSchema: { type: "object", required: ["brand"], properties: { brand: brand2(), limit: { type: "integer", minimum: 1, maximum: 50, description: "기본 10" } } },
    annotations: RO,
    run: redditMyPosts,
  },
  {
    name: "etsy_shop_info",
    description: "엣시 상품을 만들기 전에 샵 정보와 배송 프로필(shipping_profile_id), 처리 기간(readiness_state_id), 반품 정책(return_policy_id), 섹션 ID를 확인합니다. 읽기만 합니다.",
    inputSchema: { type: "object", required: ["brand"], properties: { brand: brand2("엣시 샵 브랜드") } },
    annotations: RO,
    run: etsyShopInfo,
  },
  {
    name: "etsy_find_category",
    description: "엣시 카테고리(taxonomy_id)를 영어 단어로 찾습니다(예: 'laser', 'dollhouse', 'digital pattern').",
    inputSchema: { type: "object", required: ["brand", "query"], properties: { brand: brand2(), query: { type: "string" } } },
    annotations: RO,
    run: etsyFindCategory,
  },
  {
    name: "etsy_create_draft_listing",
    description:
      "엣시 샵에 상품을 '초안'으로 만듭니다(손님에게 안 보이고 수수료 없음). 사진 주소(image_urls)를 받아 함께 올리고, 디지털 상품(type='download')이면 digital_file_url 파일도 붙입니다. 공개는 etsy_publish_listing으로 따로 합니다.",
    inputSchema: {
      type: "object",
      required: ["brand", "title", "description", "price", "taxonomy_id", "image_urls"],
      properties: {
        brand: brand2("엣시 샵 브랜드"),
        title: { type: "string", maxLength: 140 },
        description: { type: "string" },
        price: { type: "number", description: "샵 통화 기준 가격(예: 12.5)" },
        quantity: { type: "integer", description: "재고(기본: 실물 1, 디지털 999)" },
        taxonomy_id: { type: "integer", description: "etsy_find_category로 찾은 카테고리 ID" },
        type: { type: "string", enum: ["physical", "download", "both"], description: "기본 physical. 도면·SVG 같은 파일 판매는 download" },
        who_made: { type: "string", enum: ["i_did", "someone_else", "collective"], description: "기본 i_did" },
        when_made: { type: "string", description: "기본 made_to_order (엣시 값: made_to_order, 2020_2026 등)" },
        tags: { type: "array", items: { type: "string", maxLength: 20 }, maxItems: 13 },
        materials: { type: "array", items: { type: "string" } },
        image_urls: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10, description: "공개 https 사진 주소(구글 드라이브 공유 링크 가능), 첫 장이 대표 사진" },
        digital_file_url: { type: "string", description: "디지털 상품 파일 주소(20MB까지)" },
        digital_file_name: { type: "string" },
        shipping_profile_id: { type: "integer", description: "실물 상품에 필요(etsy_shop_info)" },
        readiness_state_id: { type: "integer", description: "실물 상품 처리 기간 프로필(etsy_shop_info)" },
        return_policy_id: { type: "integer" },
        shop_section_id: { type: "integer" },
        is_supply: { type: "boolean", description: "재료·부품이면 true (기본 false)" },
      },
    },
    annotations: WRITE,
    run: etsyCreateDraftListing,
  },
  {
    name: "etsy_publish_listing",
    description: "엣시 초안 상품을 공개(active)합니다. 공개하면 손님에게 보이고 게시 수수료(0.20달러)가 붙습니다. confirm을 빼면 확인용 요약만 돌려줍니다. 사용자가 그 상품을 확인한 뒤에만 confirm=true로 부르세요.",
    inputSchema: { type: "object", required: ["brand", "listing_id"], properties: { brand: brand2(), listing_id: { type: "integer" }, confirm: { type: "boolean", description: "true일 때만 실제로 공개" } } },
    annotations: WRITE,
    run: etsyPublishListing,
  },
  {
    name: "tiktok_upload_video",
    description:
      "브랜드 틱톡에 영상을 올립니다. 기본 mode='draft'는 틱톡 앱 초안함으로 보내 공개되지 않습니다(사용자가 앱에서 직접 게시). mode='direct'는 바로 게시하며, confirm을 빼면 미리보기만 돌려줍니다 — 사용자가 영상·캡션·공개 범위를 확인한 뒤에만 confirm=true. 틱톡 앱 심사 전에는 SELF_ONLY(나만 보기)만 됩니다. 100MB까지.",
    inputSchema: {
      type: "object",
      required: ["brand", "source_url"],
      properties: {
        brand: brand2("올릴 브랜드 틱톡"),
        source_url: { type: "string", description: "영상 https 주소 또는 구글 드라이브 공유 링크(MP4)" },
        caption: { type: "string", maxLength: 2200, description: "캡션(해시태그 포함). draft에서는 앱에서 붙여 넣을 문구로 돌려줌" },
        mode: { type: "string", enum: ["draft", "direct"], description: "기본 draft" },
        privacy_level: { type: "string", enum: ["SELF_ONLY", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "PUBLIC_TO_EVERYONE"], description: "direct 전용. 기본 SELF_ONLY" },
        disable_comment: { type: "boolean" },
        brand_organic: { type: "boolean", description: "자기 브랜드 홍보 표시(기본 true)" },
        confirm: { type: "boolean", description: "direct에서 true일 때만 실제로 게시" },
      },
    },
    annotations: WRITE,
    run: tiktokUploadVideo,
  },
  {
    name: "tiktok_post_status",
    description: "tiktok_upload_video가 돌려준 publish_id의 처리 상태(처리 중·초안함 도착·게시 완료·실패)를 확인합니다.",
    inputSchema: { type: "object", required: ["brand", "publish_id"], properties: { brand: brand2(), publish_id: { type: "string" } } },
    annotations: RO,
    run: tiktokPostStatus,
  },
];

function keyOk(given) {
  const want = process.env.MCP_KEY;
  if (!want || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg, full) {
  const { id, method, params } = msg ?? {};
  if (id === undefined || id === null) return null; // 알림(notifications/*)은 답하지 않는다
  const tools = TOOLS.filter((t) => full || t.open);
  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ad-monitor-mcp", version: VERSION },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })) });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return err(id, -32602, `알 수 없는 도구: ${params?.name}`);
      try {
        const text = await tool.run(params?.arguments ?? {});
        return ok(id, { content: [{ type: "text", text: String(text) }] });
      } catch (e) {
        const user = e instanceof UserError;
        if (!user) console.error(`[${tool.name}]`, e?.message ?? e);
        return ok(id, { isError: true, content: [{ type: "text", text: user ? e.message : `실행 중 오류가 났습니다: ${String(e?.message ?? e).slice(0, 300)}` }] });
      }
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return err(id, -32601, `지원하지 않는 메서드: ${method}`);
  }
}

export default async function handler(req, res) {
  const key = req.query?.key;
  const full = keyOk(key);
  if (!full && key !== "open") return res.status(401).json({ error: "unauthorized" });
  if (req.method === "GET") return res.status(405).setHeader("allow", "POST").json({ error: "POST로 MCP 요청을 보내세요." });
  if (req.method === "DELETE") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json(err(null, -32700, "JSON이 아닙니다"));
    }
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m, full)))).filter(Boolean);
    return out.length ? res.status(200).json(out) : res.status(202).end();
  }
  const out = await handle(body, full);
  return out ? res.status(200).json(out) : res.status(202).end();
}
