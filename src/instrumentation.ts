export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { autoMigrate } = await import("@/lib/db/migrate");
    await autoMigrate();
    if (process.env.DATABASE_URL) {
      const { startTolinoScheduler } = await import("@/lib/tolino/scheduler");
      startTolinoScheduler();
    }
  }
}
