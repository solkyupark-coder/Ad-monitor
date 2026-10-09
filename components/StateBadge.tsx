import { STATE_LABEL, type CampaignState } from "@/lib/campaign-state";
import { LevelIcon } from "@/components/icons";

// 집행 중 / 중지됨 / 삭제됨 배지. 색만으로 구분하지 않게 아이콘 + 글자를 함께 쓴다. 상태를 모르면 아무것도 그리지 않는다.
export function StateBadge({ state, raw }: { state?: CampaignState; raw?: string }) {
  if (!state || state === "unknown") return null;
  return (
    <span className={`sbadge ${state}`} title={raw ? `API 상태: ${raw}` : undefined} aria-label={`상태: ${STATE_LABEL[state]}`}>
      <LevelIcon level={state === "active" ? "good" : "hold"} size={10} />
      {STATE_LABEL[state]}
    </span>
  );
}
