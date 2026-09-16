import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FormState } from "@/lib/actions/state";

export function FormStatus({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <Alert
      variant={state.status === "error" ? "destructive" : "default"}
      className="mb-4"
    >
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
