"use client";
// 광고 효과 내보내기: 담을 내용·형식을 고르고 미리본 뒤 CSV로 내려받거나 요약 텍스트를 복사한다.
// 미리보기와 복사는 브라우저에서 같은 순수 함수로 만들고, CSV 파일은 서버 경로(/api/export)가 같은 계산으로 만든다.
import { useRef, useState } from "react";
import { CopyIcon, DownloadIcon } from "@/components/icons";
import { effectCsv, effectText, exportFileName, exportQuery, type ExportData, type ExportOptions, type ExportPart } from "@/lib/export";

const PARTS: { id: ExportPart; label: string }[] = [
  { id: "funnel", label: "퍼널 요약 (노출 → 클릭 → 방문 → 결제)" },
  { id: "channels", label: "채널별 효과" },
  { id: "campaigns", label: "캠페인별 판정" },
  { id: "daily", label: "일별 흐름" },
];

// CSV 미리보기: 머리글 + 구분(퍼널/채널/캠페인/일별)마다 앞 3행만, 나머지는 줄 수로 알린다.
function csvPreview(csv: string): string {
  const all = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const out: string[] = [all[0] ?? ""];
  const seen: Record<string, number> = {};
  const omitted: Record<string, number> = {};
  for (const l of all.slice(1)) {
    const kind = l.startsWith("#") || l.startsWith('"#') ? "주의 문구" : l.slice(0, l.indexOf(","));
    seen[kind] = (seen[kind] ?? 0) + 1;
    if (seen[kind] <= 3) out.push(l);
    else omitted[kind] = (omitted[kind] ?? 0) + 1;
  }
  const more = Object.entries(omitted).map(([k, v]) => `${k} ${v}줄`);
  return more.length ? `${out.join("\n")}\n… 미리보기에서 생략: ${more.join(", ")}` : out.join("\n");
}

export function ExportSheet({ data, label = "내보내기" }: { data: ExportData; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const [fmt, setFmt] = useState<"csv" | "text">("csv");
  const [parts, setParts] = useState<ExportPart[]>(["funnel", "channels", "campaigns"]);
  const [caveat, setCaveat] = useState(true);
  const [note, setNote] = useState<{ text: string; sig: string } | null>(null);

  const none = parts.length === 0;
  const opts: ExportOptions = { parts, caveat };
  const sig = `${fmt}|${parts.join(",")}|${caveat}`;
  const msg = note && note.sig === sig ? note.text : ""; // 옵션을 바꾸면 이전 안내(복사했습니다 등)는 지운다
  const preview = none ? "" : fmt === "text" ? effectText(data, opts) : csvPreview(effectCsv(data, opts).replace(/^\uFEFF/, ""));
  // 미리보기·파일명과 같은 날짜로 못 박는다(프리셋 기간이 자정에 바뀌어도 파일이 어긋나지 않게).
  const href = `/api/export?brand=${data.brand}&from=${data.range.from}&to=${data.range.to}&${exportQuery(opts)}`;

  const toggle = (id: ExportPart) => setParts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const copy = async () => {
    const full = effectText(data, opts);
    try {
      await navigator.clipboard.writeText(full);
      setNote({ text: "복사했습니다", sig });
    } catch {
      setNote({ text: "복사하지 못했습니다 — 미리보기를 길게 눌러 직접 복사하세요", sig });
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          setNote(null);
          ref.current?.showModal();
        }}
      >
        <DownloadIcon />
        {label}
      </button>
      <dialog
        ref={ref}
        className="sheet"
        aria-labelledby="sheet-h"
        onPointerDown={(e) => {
          downOnBackdrop.current = e.target === ref.current; // 시트 안에서 글자를 드래그하다 바깥에서 놓아도 닫히지 않게
        }}
        onClick={(e) => {
          if (e.target === ref.current && downOnBackdrop.current) ref.current?.close();
          downOnBackdrop.current = false;
        }}
      >
        <div className="sheet-in">
          <span className="sheet-grip" aria-hidden="true" />
          <div className="sheet-head">
            <div>
              <h2 id="sheet-h">광고 효과 내보내기</h2>
              <p className="fine">
                {data.brandLabel} · {data.range.from} ~ {data.range.to} ({data.range.days}일) · 화면과 같은 기간
              </p>
            </div>
            <button type="button" className="icon-btn" aria-label="닫기" onClick={() => ref.current?.close()}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <fieldset className="sheet-set">
            <legend>무엇을</legend>
            {PARTS.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={parts.includes(p.id)} onChange={() => toggle(p.id)} />
                <span>{p.label}</span>
              </label>
            ))}
          </fieldset>

          <div className="sheet-set">
            <span className="sheet-legend" id="fmt-l">형식</span>
            <div className="seg wide" role="group" aria-labelledby="fmt-l">
              <button type="button" aria-pressed={fmt === "csv"} className={fmt === "csv" ? "on" : ""} onClick={() => setFmt("csv")}>CSV (엑셀)</button>
              <button type="button" aria-pressed={fmt === "text"} className={fmt === "text" ? "on" : ""} onClick={() => setFmt("text")}>텍스트 요약</button>
            </div>
          </div>

          <label className="check">
            <input type="checkbox" checked={caveat} onChange={() => setCaveat((v) => !v)} />
            <span>측정 기준·주의 문구 함께 넣기 <span className="fine-inline">(봇 제외 방식, 캠페인 연결 방식)</span></span>
          </label>

          <div className="sheet-set">
            <span className="sheet-legend">미리보기</span>
            <pre className="sheet-pre" tabIndex={0}>{none ? "내용을 하나 이상 고르세요" : preview}</pre>
          </div>

          <div className="sheet-actions">
            {fmt === "csv" ? (
              <a className="btn primary big" href={none ? undefined : href} download={exportFileName(data, "csv")} aria-disabled={none}>
                <DownloadIcon />
                CSV 내려받기
              </a>
            ) : (
              <button type="button" className="btn primary big" onClick={copy} disabled={none}>
                <CopyIcon />
                요약 복사
              </button>
            )}
            <p className="fine center" role="status" aria-live="polite">
              {msg || (fmt === "csv" ? `파일명 ${exportFileName(data, "csv")} · 토큰·계정 정보는 들어가지 않습니다` : "토큰·계정 정보는 들어가지 않습니다")}
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
