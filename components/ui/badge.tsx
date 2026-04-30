import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full items-center justify-center rounded-full border px-2.5 py-1 text-center text-[11px] font-bold uppercase leading-4 tracking-[0.08em] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.4)] transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-border/70 bg-white/88 text-foreground",
        outline: "text-foreground",
        success: "border-primary/14 bg-primary-soft text-primary",
        warning: "border-secondary/15 bg-secondary-soft/85 text-secondary-foreground",
        danger: "border-destructive/15 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
