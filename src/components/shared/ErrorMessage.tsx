import { cn } from "@/lib/utils/cn";
import { Icon } from "./Icon";

interface ErrorMessageProps {
  message?: string;
  className?: string;
}

export function ErrorMessage({
  message = "Something went wrong. Please try again.",
  className,
}: ErrorMessageProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      <Icon
        name="error"
        className="text-[48px] text-error mb-4"
      />
      <p className="font-body-md text-body-md text-on-surface-variant">
        {message}
      </p>
    </div>
  );
}
