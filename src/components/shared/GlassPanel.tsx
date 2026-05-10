import { cn } from "@/lib/utils/cn";
import { HTMLAttributes, forwardRef } from "react";

export const GlassPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("glass-panel", className)} {...props}>
        {children}
      </div>
    );
  }
);

GlassPanel.displayName = "GlassPanel";
