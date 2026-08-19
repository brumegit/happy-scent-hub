import { useState } from "react";
import {
  PUSH_STEP_LABELS,
  usePushDebugStore,
  type PushStepKey,
  type PushStepStatus,
} from "@/stores/pushDebugStore";

const KEYS: PushStepKey[] = ["name", "modes", "intensity", "schedule"];

const dotClass: Record<PushStepStatus, string> = {
  idle: "bg-muted-foreground/40",
  pending: "bg-[--pairing] animate-pulse",
  ok: "bg-emerald-400",
  unconfirmed: "bg-[--gold]",
  fail: "bg-destructive",
};

const textClass: Record<PushStepStatus, string> = {
  idle: "text-muted-foreground",
  pending: "text-[--pairing]",
  ok: "text-emerald-400",
  unconfirmed: "text-[--gold]",
  fail: "text-destructive",
};

/**
 * Development strip: shows exactly what the diffuser acknowledged on the last
 * push (device name, working modes, intensity, schedule) with read-back detail.
 */
export function PushDebugStrip() {
  const { steps, startedAt, linkError, log } = usePushDebugStore();
  const email = useIdentityStore((s) => s.email);
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);

  // Debug tooling is only visible to internal Brume accounts.
  if (!hydrated || !email?.toLowerCase().includes("@brume")) return null;


  return (
    <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 overflow-x-auto px-4 py-2 text-left"
      >
        <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Debug
        </span>
        {KEYS.map((key) => (
          <span key={key} className="flex shrink-0 items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${dotClass[steps[key].status]}`} />
            <span className={`text-[11px] ${textClass[steps[key].status]}`}>
              {PUSH_STEP_LABELS[key]}
            </span>
          </span>
        ))}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          <p>{startedAt ? `Last push ${new Date(startedAt).toLocaleTimeString()}` : "No push yet."}</p>
          {linkError && <p className="text-destructive">{linkError}</p>}
          {KEYS.map((key) => (
            <p key={key}>
              <span className={textClass[steps[key].status]}>{PUSH_STEP_LABELS[key]}</span>{" "}
              — {steps[key].status}
              {steps[key].detail ? `: ${steps[key].detail}` : ""}
            </p>
          ))}
          {log.length > 0 && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-4 text-muted-foreground/70">
              {log.join("\n")}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
