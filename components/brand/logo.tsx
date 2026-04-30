import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "light" | "mark";
};

const sizes = {
  sm: { mark: "h-8 w-8", text: "text-base", radius: "rounded-[10px]" },
  md: { mark: "h-10 w-10", text: "text-xl", radius: "rounded-[12px]" },
  lg: { mark: "h-14 w-14", text: "text-2xl", radius: "rounded-[16px]" },
};

export function Logo({ className, size = "md", variant = "default" }: LogoProps) {
  const config = sizes[size];
  const light = variant === "light";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center bg-gradient-brand shadow-elevated ring-1 ring-inset ring-white/15",
          config.mark,
          config.radius,
        )}
      >
        <span className="pointer-events-none absolute inset-x-1.5 top-1 h-1/3 rounded-t-md bg-white/15 blur-[2px]" />
        <svg className="relative h-[60%] w-[60%]" fill="none" viewBox="0 0 32 32">
          <path
            d="M8 6 H24 V11 H13 V15 H21 V20 H13 V26 H8 Z"
            fill="hsl(var(--primary-foreground))"
          />
          <circle cx="25" cy="24" fill="hsl(var(--secondary))" r="3" />
        </svg>
      </div>
      {variant !== "mark" ? (
        <div className={cn("font-extrabold leading-none tracking-tight", config.text)}>
          <span className={light ? "text-primary-foreground" : "text-foreground"}>Fechou</span>
          <span className="text-primary">MEI</span>
        </div>
      ) : null}
    </div>
  );
}
