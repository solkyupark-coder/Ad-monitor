// 판정·상태 아이콘. 색만으로 구분하지 않도록 모양(✓ ! ✕ –)을 함께 쓴다.
export type Level = "good" | "warn" | "bad" | "info" | "hold";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function LevelIcon({ level, size = 12 }: { level: Level; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...P}>
      {level === "good" && <path d="M5 12.5l5 5 9-10.5" />}
      {level === "warn" && (
        <>
          <path d="M12 3.5l9.5 17h-19z" />
          <path d="M12 10v4.5" />
          <path d="M12 17.6h.01" />
        </>
      )}
      {level === "bad" && (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      )}
      {(level === "info" || level === "hold") && <path d="M5 12h14" />}
    </svg>
  );
}

export const DownloadIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...P} strokeWidth={2}>
    <path d="M12 4v11" />
    <path d="M7 10.5l5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);

export const CopyIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...P} strokeWidth={2}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
  </svg>
);
