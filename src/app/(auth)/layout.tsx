import { Brand } from "@/components/brand";
import { PageTransition } from "@/components/page-transition";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Brand className="mb-8" />
      <div className="w-full max-w-sm">
        <PageTransition>{children}</PageTransition>
      </div>
      <p className="mt-10 text-xs text-muted-foreground">
        Retrospine · your reading, remembered.
      </p>
    </div>
  );
}
