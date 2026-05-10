import { cn } from "@/lib/utils/cn";
import type { CSSProperties } from "react";

interface IconProps {
  name: string;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
  weight?: number;
}

export function Icon({ name, className, style, filled = false, weight }: IconProps) {
  return (
    <span
      className={cn("material-symbols-outlined select-none", className)}
      style={{
        ...style,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}${weight !== undefined ? `, 'wght' ${weight}` : ""}`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
