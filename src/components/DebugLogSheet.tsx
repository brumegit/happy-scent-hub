import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useHydrated } from "@/hooks/useHydrated";
import { setDebugEnabled, useDebugMode } from "@/hooks/useDebugMode";
import { usePushDebugStore } from "@/stores/pushDebugStore";

/** Opens the full Bluetooth trace from controls floating below the app header. */
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

  /**
   * Routes the log to support by email. On iPhone the log becomes a .txt
   * attachment shared into Mail, so the From address is genuinely the user's
   * own account. On web, mailto cannot carry attachments: the message is
   * prefilled and the log is copied to the clipboard to paste.
   */
  const emailSupport = async () => {
    const subject = "Brume diffuser issue";
    const body =
      "Hello, I ran into an issue while configuring my diffuser. Please see the log attached and come back to me as soon as possible.";
    try {
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const file = await Filesystem.writeFile({
          path: "brume-debug-log.txt",
          data: text,
          directory: Directory.Cache,
        });
        await Share.share({
          title: subject,
          text: `${body}\n\nSend to: contact@brume.me`,
          url: file.uri,
          dialogTitle: "Email the log to contact@brume.me",
        });
      } else {
        await navigator.clipboard.writeText(text).catch(() => {});
        const hint = `${body}\n\n(The debug log was copied to your clipboard — paste it here.)`;
        window.location.href = `mailto:contact@brume.me?subject=${encodeURIComponent(
          subject,
        )}&body=${encodeURIComponent(hint)}`;
      }
    } catch {
      // User dismissed the sheet or the file write failed.
    }
  };

  return (
    <>
      <div
        className="fixed left-1/2 z-[59] flex -translate-x-1/2 items-stretch overflow-hidden rounded-[5px] border border-gold bg-background shadow-lg"
        style={{ top: "calc(env(safe-area-inset-top) + 4.5rem)" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-10 whitespace-nowrap border-r border-gold px-4 text-xs font-medium text-gold"
        >
          Open debug log
        </button>
        <button
          type="button"
          onClick={() => setDebugEnabled(false)}
          className="h-10 whitespace-nowrap px-4 text-xs font-medium text-gold"
        >
          Exit debug mode
        </button>
      </div>

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
              <button
                type="button"
                onClick={() => void emailSupport()}
                className="rounded-[5px] border border-gold px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-gold"
              >
                Email log
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
