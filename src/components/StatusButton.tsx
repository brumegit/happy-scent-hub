import { Bluetooth, Check, X } from "lucide-react";

export type CircleState = "idle" | "pairing" | "success" | "error";

/**
 * Full-width CTA bar used through onboarding. Same state machine as the old
 * status circle — label changes, colour changes, and a champagne "dripple"
 * ripple runs underneath while pairing / sending.
 */
export function StatusButton({
  state,
  label,
  onClick,
  fading = false,
  icon = true,
}: {
  state: CircleState;
  label: string;
  onClick?: () => void;
  fading?: boolean;
  icon?: boolean;
}) {
  const tone =
    state === "pairing"
      ? "border-gold text-gold"
      : state === "success"
        ? "border-emerald-400 text-emerald-300"
        : state === "error"
          ? "border-destructive text-destructive"
          : "border-foreground text-foreground hover:bg-foreground/5";

  const Tag = onClick && state === "idle" ? "button" : "div";

  return (
    <div
      className="transition-opacity ease-out"
      style={{ opacity: fading ? 0 : 1, transitionDuration: fading ? "3000ms" : "300ms" }}
    >
      <Tag
        {...(Tag === "button" ? { type: "button" as const, onClick } : {})}
        className={`relative flex w-full items-center justify-center gap-3 overflow-hidden border px-6 py-4 text-sm uppercase tracking-[0.22em] transition-colors duration-500 ${tone}`}
      >
        {state === "pairing" && (
          <span className="pointer-events-none absolute inset-0">
            <span className="absolute inset-0 animate-pulse bg-gold/10" />
            <span className="absolute bottom-0 left-0 h-px w-1/3 animate-[slide-in-right_1.6s_ease-in-out_infinite] bg-gold" />
          </span>
        )}
        {icon && state === "idle" && <Bluetooth className="size-4" aria-hidden />}
        {state === "success" && <Check className="size-4" aria-hidden />}
        {state === "error" && <X className="size-4" aria-hidden />}
        <span className="relative">{label}</span>
      </Tag>
    </div>
  );
}
