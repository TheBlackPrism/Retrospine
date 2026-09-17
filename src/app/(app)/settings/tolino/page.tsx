import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { SettingsSection } from "@/components/settings/section";
import { TolinoBookList, type TolinoBookItem } from "@/components/settings/tolino/book-list";
import { TolinoConnectForm } from "@/components/settings/tolino/connect-form";
import { TolinoOptions, TolinoStatusCard } from "@/components/settings/tolino/status-card";
import { requireSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { pluralize } from "@/lib/format";
import {
  getTolinoConnection,
  listTolinoBooks,
  toConnectionView,
} from "@/lib/tolino/connection";

export const metadata: Metadata = { title: "Tolino Cloud" };

export default async function TolinoSettingsPage(props: PageProps<"/settings/tolino">) {
  const session = await requireSession();
  const params = await props.searchParams;
  const connection = await getTolinoConnection(session.user.id);
  const reconnect = params.reconnect === "1";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
          ← Settings
        </Link>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Tolino Cloud
        </h1>
      </div>

      {!connection || reconnect ? (
        <SettingsSection
          title={connection ? "Connect again" : "Connect your tolino"}
          description="Retrospine reads your Tolino library and reading positions and turns them into shelves and milestones. Bookshops protect their sign-in pages from scripts, so the connection uses a token from the tolino web reader."
        >
          <TolinoConnectForm
            defaultResellerId={connection?.resellerId ?? null}
            replacing={Boolean(connection)}
          />
        </SettingsSection>
      ) : null}

      {connection ? <ConnectedSections userId={session.user.id} connectionId={connection.id} /> : null}
    </div>
  );
}

async function ConnectedSections({ userId, connectionId }: { userId: string; connectionId: string }) {
  const [connection, books] = await Promise.all([
    db.query.tolinoConnections.findFirst({ where: eq(schema.tolinoConnections.id, connectionId) }),
    listTolinoBooks(userId),
  ]);
  if (!connection) return null;

  const bookIds = books.map((row) => row.bookId).filter((id): id is string => Boolean(id));
  const entries = bookIds.length
    ? await db.query.libraryEntries.findMany({
        where: and(
          eq(schema.libraryEntries.userId, userId),
          inArray(schema.libraryEntries.bookId, bookIds),
        ),
        columns: { bookId: true, status: true },
      })
    : [];
  const statusByBook = new Map(entries.map((entry) => [entry.bookId, entry.status]));

  const items: TolinoBookItem[] = books.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    authors: row.authors,
    kind: row.kind,
    coverUrl: row.coverUrl,
    progress: row.progress,
    progressAt: row.progressAt?.toISOString() ?? null,
    finished: row.finished,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    ignored: row.ignored,
    matchSource: row.matchSource,
    book: row.book
      ? {
          id: row.book.id,
          title: row.book.title,
          thumbnailUrl: row.book.thumbnailUrl ?? row.book.coverUrl,
          status: statusByBook.get(row.book.id) ?? null,
        }
      : null,
  }));
  const matched = items.filter((item) => item.book && !item.ignored).length;
  const view = toConnectionView(connection);

  return (
    <>
      <SettingsSection title="Connection" description="Your tolino account and the last sync.">
        <TolinoStatusCard connection={view} />
      </SettingsSection>

      <SettingsSection title="Sync options" description="What the sync imports and when it runs.">
        <TolinoOptions connection={view} intervalMinutes={env.tolinoSyncIntervalMinutes} />
      </SettingsSection>

      <SettingsSection
        title="Your Tolino library"
        description={
          items.length
            ? `${pluralize(items.length, "book")}, ${matched} linked to your shelves. Fix a wrong match or exclude a book from the menu of each row.`
            : "Books appear here after the first sync."
        }
      >
        <TolinoBookList items={items} />
      </SettingsSection>
    </>
  );
}
