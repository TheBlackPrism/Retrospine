import { BookX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function BookNotFound() {
  return (
    <EmptyState
      icon={BookX}
      title="That book is not on any shelf"
      description="It may have been removed, or the link is out of date."
      action={
        <Button asChild>
          <Link href="/library">Back to the library</Link>
        </Button>
      }
    />
  );
}
