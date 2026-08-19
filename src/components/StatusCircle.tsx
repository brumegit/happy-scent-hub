import { Bluetooth, Check, X } from "lucide-react";

export type CircleState = "idle" | "pairing" | "success" | "error";

/**
 * The onboarding status circle. Idle sits centred and says START NOW; pairing
 * turns champagne and rises to the top with a dripple; success/error confirm.
 */
export function StatusCircle({
  state,
  label,
  position = "center",
  onClick,
  fading = false,
}: {
  state: CircleState;
  label: string;
  position?: "center" | "top";
  onClick?: () => void;
  fading?: boolean;
}) {
  const tone =
    state === "pairing"
      ? "border-gold bg-gold/15 text-gold"
      : state === "success"
        ? "border-emerald-400 bg-emerald-400/15 text-emerald-300"
        : state === "error"
          ? "border-destructive bg-destructive/15 text-destructive"
          : "border-foreground/40 bg-transparent text-foreground";

  const size = position === "top" ? "size-32" : "size-56";
  const Tag = onClick ? "button" : "div";

  return (
    <div
      className={`flex justify-center transition-all duration-700 ease-out ${
        position === "top" ? "pt-2" : "py-12"
      } ${fading ? "opacity-0" : "opacity-100"}`}
      style={{ transitionDuration: fading ? "3000ms" : "700ms" }}
    >
      <Tag
        {...(onClick ? { type: "button" as const, onClick } : {})}
        className={`relative flex ${size} items-center justify-center rounded-full border transition-all duration-700 ease-out ${tone} ${
          onClick ? "hover:bg-foreground/5" : ""
        }`}
      >
        {state === "pairing" && (
          <>
            <span className="absolute inset-0 animate-ping rounded-full border border-gold/50" />
            <span className="absolute -bottom-6 h-6 w-px animate-pulse bg-gradient-to-b from-gold to-transparent" />
          </>
        )}
        <span className="flex flex-col items-center gap-2">
          {state === "idle" && <Bluetooth className="size-6" aria-hidden />}
          {state === "success" && <Check className="size-7" aria-hidden />}
          {state === "error" && <X className="size-7" aria-hidden />}
          <span
            className={`font-display uppercase tracking-[0.22em] ${
              position === "top" ? "text-sm" : "text-xl"
            }`}
          >
            {label}
          </span>
        </span>
      </Tag>
    </div>
  );
}
