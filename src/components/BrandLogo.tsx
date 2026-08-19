import logo from "@/assets/brume-logo.svg";

export function BrandLogo({ className = "h-6" }: { className?: string }) {
  return <img src={logo} alt="Brume" className={`w-auto ${className}`}
      style={{ filter: "brightness(0) invert(1)" }}
    />;
}
