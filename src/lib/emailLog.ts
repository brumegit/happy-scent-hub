import { Capacitor } from "@capacitor/core";
import { pushDebug } from "@/stores/pushDebugStore";

/**
 * Builds the current debug log text (same shape as the debug sheet shows).
 */
export function debugLogText(): string {
  const { log, linkError, startedAt } = pushDebug();
  return [
    startedAt ? `Last push ${new Date(startedAt).toLocaleTimeString()}` : "No push yet.",
    linkError ? `\nERROR:\n${linkError}\n` : "",
    ...log,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Opens a concierge request email with the debug log attached. On iPhone the
 * log becomes a .txt attachment shared into Mail, so the From address is
 * genuinely the user's own account. On web, mailto cannot carry attachments:
 * the message is prefilled and the log is copied to the clipboard to paste.
 */
export async function emailDebugLog(): Promise<void> {
  const text = debugLogText();
  const subject = "Brume concierge request";
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
}
