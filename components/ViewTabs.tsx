"use client";
// 한 화면에서 보기 영역을 전환하는 탭. 모든 패널은 서버에서 그려 두고 숨김/표시만 바꾼다(전환이 즉시, 다시 불러오지 않음).
// 선택한 탭은 주소의 #해시에 남겨 새로고침·공유해도 유지된다.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { LevelIcon } from "@/components/icons";

export type TabDef = {
  id: string;
  label: string;
  short: string; // 폰 하단 바에 들어가는 짧은 이름
  badge?: { text: string; short: string; level: "bad" | "warn" | "info" } | null; // short: 폰 하단 바용(숫자만)
  node: ReactNode;
};

export function ViewTabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = useCallback(
    (id: string, focus = false) => {
      setActive(id);
      try {
        history.replaceState(null, "", `#${id}`);
      } catch {
        /* 주소 갱신이 막힌 환경이면 상태만 바꾼다 */
      }
      if (focus) refs.current[id]?.focus();
    },
    [],
  );

  useEffect(() => {
    const fromHash = () => {
      let id = location.hash.replace(/^#/, "");
      try {
        id = decodeURIComponent(id); // 깨진 %인코딩 해시(#%E0%A4%A)는 무시한다 — 던지면 페이지 전체가 죽는다
      } catch {
        return;
      }
      if (tabs.some((t) => t.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    // 기간·브랜드 이동(링크, 날짜 폼)이 보던 탭을 잃지 않게: data-keep-hash 가 붙은 곳을 누르면 현재 #탭을 주소 뒤에 붙인다.
    const keepOnClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[data-keep-hash]") as HTMLAnchorElement | null;
      if (a && location.hash) a.hash = location.hash;
    };
    const keepOnSubmit = (e: Event) => {
      const f = e.target as HTMLFormElement | null;
      if (f?.matches?.("form[data-keep-hash]") && location.hash) {
        const u = new URL(f.action, location.href);
        u.hash = location.hash;
        f.action = u.toString();
      }
    };
    document.addEventListener("click", keepOnClick, true);
    document.addEventListener("submit", keepOnSubmit, true);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", keepOnClick, true);
      document.removeEventListener("submit", keepOnSubmit, true);
    };
  }, [tabs]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to >= 0) {
      e.preventDefault();
      select(tabs[to].id, true);
    }
  };

  return (
    <div className="vt">
      <noscript>
        {/* JavaScript 없이도 모든 화면을 이어서 볼 수 있게 */}
        <style>{`.vpanel[hidden]{display:block}.vtabs{display:none}`}</style>
      </noscript>
      <div className="vtabs" role="tablist" aria-label="화면 전환">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            aria-label={t.badge ? `${t.label} (${t.badge.text})` : undefined}
            tabIndex={active === t.id ? 0 : -1}
            className={active === t.id ? "vtab on" : "vtab"}
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="vtab-long">{t.label}</span>
            <span className="vtab-short">{t.short}</span>
            {t.badge && (
              <span className={`vtab-badge ${t.badge.level}`} aria-hidden="true">
                <LevelIcon level={t.badge.level === "bad" ? "bad" : t.badge.level === "warn" ? "warn" : "info"} size={9} />
                <span className="vb-long">{t.badge.text}</span>
                <span className="vb-short">{t.badge.short}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="vpanel">
          {t.node}
        </div>
      ))}
    </div>
  );
}
