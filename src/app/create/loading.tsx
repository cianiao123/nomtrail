import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

export default function CreateLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-lg py-8">
      <LoadingSkeleton className="h-10 w-64 mb-2" />
      <LoadingSkeleton className="h-5 w-96 mb-8" />
      <LoadingSkeleton className="h-12 w-full mb-8" />
      <LoadingSkeleton className="h-12 w-full mb-4" />
      <LoadingSkeleton className="h-12 w-full mb-4" />
      <LoadingSkeleton className="h-12 w-full mb-4" />
      <LoadingSkeleton className="h-32 w-full mb-4" />
      <LoadingSkeleton className="h-14 w-full" />
    </div>
  );
}
