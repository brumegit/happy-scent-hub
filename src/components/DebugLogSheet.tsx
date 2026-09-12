import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { useDebugMode } from "@/hooks/useDebugMode";
import { usePushDebugStore } from "@/stores/pushDebugStore";

/**
 * Debug-only button pinned above the exit banner. Opens a full-height,
 * scrollable sheet with the complete Bluetooth trace so it can be read,
 * selected and copied (or shared) from a phone.
 */
export function DebugLogSheet() {
  const debug = useDebugMode();
  const hydrated = useHydrated();
  const { log, linkError, startedAt } = usePushDebugStore();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  if (!hydrated || !debug) return null;

  const text = [
    startedAt ? `Last push ${new Date(startedAt).toLocaleTimeString()}` : "No push yet.",
    linkError ? `\nERROR:\n${linkError}\n` : "",
    ...log,
  ]
    .filter(Boolean)
    .join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Copied");
    } catch {
      setCopied("Copy failed — select the text manually");
    }
    setTimeout(() => setCopied(null), 2500);
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "BRUME debug log", text });
    } catch {
      // User dismissed the share sheet.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed inset-x-0 z-[59] border-t border-border bg-background/95 px-4 py-3 text-center text-sm font-medium text-foreground backdrop-blur"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 3rem)" }}
      >
        Open debug log
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-background">
          <div
            className="flex items-center justify-between gap-2 border-b border-border px-4 py-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
          >
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Debug log
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copy()}
                className="rounded-[5px] border border-border px-3 py-1.5 text-[11px] uppercase tracking-[0.15em]"
              >
                Copy
              </button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  type="button"
                  onClick={() => void share()}
                  className="rounded-[5px] border border-border px-3 py-1.5 text-[11px] uppercase tracking-[0.15em]"
                >
                  Share
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[5px] border border-border px-3 py-1.5 text-[11px] uppercase tracking-[0.15em]"
              >
                Close
              </button>
            </div>
          </div>

          {copied && (
            <p className="px-4 py-2 text-[11px] text-gold">{copied}</p>
          )}

          <div
            className="flex-1 overflow-y-auto px-4 py-3"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <textarea
              readOnly
              value={text}
              onFocus={(event) => event.currentTarget.select()}
              className="h-[70vh] w-full resize-none bg-transparent font-mono text-[11px] leading-4 text-muted-foreground outline-none"
            />
          </div>
        </div>
      )}
    </>
  );
}
