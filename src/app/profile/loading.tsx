import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

export default function ProfileLoading() {
  return (
    <div className="max-w-container-max mx-auto px-4 lg:px-lg pt-8">
      <div className="flex items-center gap-4 mb-8">
        <LoadingSkeleton className="w-16 h-16 rounded-full" />
        <div>
          <LoadingSkeleton className="h-8 w-40 mb-2" />
          <LoadingSkeleton className="h-5 w-32" />
        </div>
      </div>
      <LoadingSkeleton className="h-10 w-full mb-8" />
      <LoadingSkeleton className="h-64 w-full" />
    </div>
  );
}
