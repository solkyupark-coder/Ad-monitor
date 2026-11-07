// 공통 도구: 브랜드 이름, 결과 문장, 영상 내려받기(구글 드라이브 공유 링크 포함).
export const BRAND_NAME = { topo: "토포제네시스", houscaper: "하우스케이퍼" };
export const BRAND_ENV = { topo: "TOPO", houscaper: "HOUSCAPER" };
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export class UserError extends Error {}

export function needBrand(brand) {
  if (brand !== "topo" && brand !== "houscaper") throw new UserError("brand는 topo 또는 houscaper여야 합니다.");
  return brand;
}

export function env(name) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export function needEnv(names, what) {
  const missing = names.filter((n) => !env(n));
  if (missing.length) throw new UserError(`${what} 연결이 아직 안 됐습니다. ad-monitor-mcp 프로젝트 환경변수에 ${missing.join(", ")}를 넣고 재배포하세요.`);
}

// 구글 드라이브 공유 링크 → 직접 내려받기 주소.
export function directUrl(src) {
  let u;
  try {
    u = new URL(src);
  } catch {
    throw new UserError("source_url이 올바른 주소가 아닙니다.");
  }
  if (u.protocol !== "https:") throw new UserError("https 주소만 받습니다.");
  if (/(^|\.)drive\.google\.com$/.test(u.hostname) || u.hostname === "docs.google.com") {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/) || u.pathname.match(/\/d\/([^/]+)/);
    const id = (m && m[1]) || u.searchParams.get("id");
    if (!id) throw new UserError("구글 드라이브 링크에서 파일 ID를 찾지 못했습니다.");
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  }
  return u.toString();
}

// 영상(또는 이미지·파일)을 메모리로 받는다. limit을 넘거나 HTML(로그인·바이러스 검사 화면)이 오면 멈춘다.
export async function fetchBytes(src, { limit = MAX_VIDEO_BYTES, kind = "영상" } = {}) {
  const url = directUrl(src);
  const res = await fetch(url, { redirect: "follow" }).catch(() => null);
  if (!res) throw new UserError(`${kind}을 내려받지 못했습니다(네트워크).`);
  if (!res.ok) throw new UserError(`${kind}을 내려받지 못했습니다(HTTP ${res.status}). 공개 링크인지(드라이브는 '링크가 있는 모든 사용자') 확인하세요.`);
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (type.includes("text/html")) throw new UserError(`${kind} 대신 웹페이지가 왔습니다. 드라이브 공유 설정을 '링크가 있는 모든 사용자'로 바꾸거나 직접 내려받는 주소를 주세요.`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > limit) throw new UserError(`${kind}이 너무 큽니다(${Math.round(len / 1048576)}MB, 최대 ${Math.round(limit / 1048576)}MB).`);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new UserError(`${kind}이 너무 큽니다(최대 ${Math.round(limit / 1048576)}MB).`);
    }
    chunks.push(value);
  }
  if (!size) throw new UserError(`${kind} 파일이 비어 있습니다.`);
  const name = (res.headers.get("content-disposition") || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1];
  return { bytes: Buffer.concat(chunks.map((c) => Buffer.from(c))), type: type.split(";")[0] || "application/octet-stream", name: name ? decodeURIComponent(name) : null };
}

export const looksLikeMp4 = (buf) => buf.length > 12 && buf.subarray(4, 8).toString("ascii") === "ftyp";

export async function readJson(res) {
  const t = await res.text().catch(() => "");
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    return { _raw: t.slice(0, 300) };
  }
}
