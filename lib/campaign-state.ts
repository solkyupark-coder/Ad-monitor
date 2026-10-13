// 캠페인이 지금 돌고 있는지(집행 중) / 우리가 껐는지(중지됨) / 지웠는지(삭제됨)를 API 상태에서 정한다(순수 함수).
// 이미 꺼진 캠페인에는 "예산을 줄이거나 끄라"는 행동 제안을 하지 않고, 과거 기록으로만 보여 주기 위해 쓴다.
export type CampaignState = "active" | "paused" | "removed" | "unknown";

export const STATE_LABEL: Record<CampaignState, string> = { active: "집행 중", paused: "중지됨", removed: "삭제됨", unknown: "상태 모름" };
export const isStopped = (s: CampaignState | undefined): boolean => s === "paused" || s === "removed";

// Google Ads campaign.status: ENABLED / PAUSED / REMOVED
export function googleState(status: string | undefined): CampaignState {
  switch ((status ?? "").toUpperCase()) {
    case "ENABLED": return "active";
    case "PAUSED": return "paused";
    case "REMOVED": return "removed";
    default: return "unknown";
  }
}

const REMOVED = new Set(["DELETED", "ARCHIVED"]);
const PAUSED = new Set(["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]);
const RUNNING = new Set(["ACTIVE", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "PREAPPROVED"]);

// Meta: 캠페인 effective_status / configured_status + (있으면) 그 캠페인 광고들의 effective_status.
// 인스타 부스트는 캠페인은 켜져 있는데 광고만 꺼지는 경우가 있어서, 광고가 하나도 안 돌면 광고 쪽 상태를 따른다.
export function metaState(x: { effective?: string; configured?: string; ads?: string[] }): CampaignState {
  const eff = (x.effective ?? "").toUpperCase();
  const conf = (x.configured ?? "").toUpperCase();
  if (!eff && !conf) return "unknown";
  if (REMOVED.has(eff) || REMOVED.has(conf)) return "removed";
  if (PAUSED.has(eff) || conf === "PAUSED") return "paused";
  const ads = (x.ads ?? []).map((a) => a.toUpperCase());
  if (ads.length && !ads.some((a) => RUNNING.has(a))) {
    if (ads.every((a) => REMOVED.has(a))) return "removed";
    if (ads.some((a) => PAUSED.has(a) || REMOVED.has(a))) return "paused";
  }
  return "active";
}
