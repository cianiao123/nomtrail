import { Icon } from "./Icon";
import { Button } from "./Button";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon = "explore",
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      <Icon
        name={icon}
        className="text-[64px] text-outline-variant mb-6"
        weight={200}
      />
      <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">
        {title}
      </h3>
      {description && (
        <p className="font-body-md text-body-md text-on-surface-variant mb-6 max-w-sm">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
