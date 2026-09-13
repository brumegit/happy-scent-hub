import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { sendConciergeRequest } from "@/lib/concierge.functions";
import { debugLogText } from "@/lib/emailLog";

type Props = {
  /** Rendered trigger label. */
  label?: string;
  className?: string;
};

/**
 * Collects the customer's email and sends a concierge request (with the
 * diffuser debug log) straight to Brume support from the app — no mail app.
 */
export function ConciergeRequest({
  label = "Need help setting up? Click here to open a concierge request.",
  className,
}: Props) {
  const send = useServerFn(sendConciergeRequest);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setStatus("sending");
    setMessage(null);
    try {
      await send({ data: { email, log: debugLogText() } });
      setStatus("sent");
      setMessage("Request sent. Our concierge will reply to you by email.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error && /valid email/i.test(error.message)
          ? "Enter a valid email address."
          : "We couldn't send your request. Please check your connection and try again.",
      );
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "text-sm text-gold underline underline-offset-4"}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/90 px-[10vw]">
          <div className="w-full rounded-[5px] border border-border bg-background p-5">
            <p className="text-sm text-muted-foreground">
              Leave your email and we'll come back to you as soon as possible.
            </p>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              className="mt-4 h-12 w-full rounded-[5px] border border-border bg-transparent px-3 text-base outline-none focus:border-gold"
            />
            {message && (
              <p
                className={`mt-3 text-sm ${status === "error" ? "text-destructive" : "text-gold"}`}
              >
                {message}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={status === "sending" || status === "sent"}
                onClick={() => void submit()}
                className="h-12 flex-1 rounded-[5px] border border-gold bg-background text-sm uppercase tracking-[0.15em] text-gold disabled:opacity-50"
              >
                {status === "sending" ? "Sending" : status === "sent" ? "Sent" : "Send"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setStatus("idle");
                  setMessage(null);
                }}
                className="h-12 flex-1 rounded-[5px] border border-border bg-background text-sm uppercase tracking-[0.15em]"
              >
                {status === "sent" ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
