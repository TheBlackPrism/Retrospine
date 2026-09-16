"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BackButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 text-muted-foreground"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/library");
      }}
    >
      <ArrowLeft data-icon="inline-start" />
      Back
    </Button>
  );
}
