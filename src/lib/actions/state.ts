export type FormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export const idleState: FormState = { status: "idle" };

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };
