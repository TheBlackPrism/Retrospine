import { Skeleton } from "@/components/ui/skeleton";

export default function BookLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-20" />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <Skeleton className="mx-auto aspect-[2/3] w-40 rounded-lg sm:mx-0 sm:w-44" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-48" />
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}
