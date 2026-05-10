import { cn } from "@/lib/utils/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}

const variantClasses = {
  primary:
    "bg-primary text-on-primary hover:shadow-lg transition-all duration-200",
  secondary:
    "bg-secondary text-on-secondary hover:shadow-lg transition-all duration-200",
  ghost:
    "text-on-surface-variant hover:bg-surface-container transition-colors",
  outline:
    "border border-outline-variant text-on-surface hover:bg-surface-container transition-colors",
};

const sizeClasses = {
  sm: "py-1.5 px-3 text-label-md rounded-lg",
  md: "py-2.5 px-5 text-label-md rounded-lg",
  lg: "py-3 px-6 text-body-md rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-label-md text-label-md",
          variantClasses[variant],
          sizeClasses[size],
          "active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
