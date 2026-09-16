# Tolino Cloud sync

Retrospine can read the library of a tolino account and turn it into shelves
and milestones: books you own appear on your shelves, the position you are at
becomes a progress milestone, and books that tolino considers finished are
marked as finished. The sync is one way (Tolino → Retrospine) and never writes
to the Tolino Cloud.

## How it works

```mermaid
flowchart LR
  Reader[tolino web reader] -- refresh token --> Settings[Settings → Tolino Cloud]
  Settings -- verify & store --> DB[(tolino_connections)]
  Sync[sync run] -- refresh token --> Shop[Bookshop OAuth endpoint]
  Sync -- inventory & reading positions --> Tolino[api.pageplace.de / bosh.pageplace.de]
  Sync -- ISBN, title --> GB[Google Books]
  Sync -- entries & milestones --> Shelves[(library_entries, reading_events)]
```

1. **Connecting.** The bookshops (Thalia, Orell Füssli, Osiander, …) protect
   their sign-in pages against scripts, so Retrospine cannot log in with a
   username and password. Instead you sign in to the
   [tolino web reader](https://webreader.mytolino.com/library/) once and copy
   the `refresh_token` from the `token` request in the browser's developer
   tools. Retrospine exchanges it for an access token, looks up the device
   the web reader registered (or registers "Retrospine" as a device), checks
   that it can read your reading positions and stores everything encrypted.
   Refresh tokens rotate: after connecting, the web reader tab will ask you to
   sign in again, which does not affect Retrospine.
2. **Syncing.** A run fetches the inventory (purchases, uploads, optionally
   audiobooks) and the reading state of every publication, matches each
   publication to a book and records what changed since the previous run.
   Runs happen when you press **Sync now**, right after connecting, and
   automatically in the background (see below).
3. **Keeping the connection alive.** Access tokens last about an hour and are
   refreshed on demand. The refresh token itself expires after roughly ten
   hours without use, so the scheduler also refreshes tokens that are about
   to expire even when no sync is due. If the server was down for longer than
   that, the sync fails with "Tolino Cloud sign-in failed" and the settings
   page offers to connect again with a fresh token.

## Matching books

Publications are matched in this order:

1. A book in the database with the same ISBN-13 (purchased books embed the
   ISBN in their publication id, `DT0400.<ISBN>_A…`).
2. Google Books, by `isbn:` first and then by title and author; the volume is
   imported like a search result, including series discovery.
3. A book created from the Tolino metadata alone (title, authors, publisher,
   language, cover). Uploaded files usually end up here.

Free reading samples are skipped. The result is remembered in `tolino_books`,
so a book is matched once. On **Settings → Tolino Cloud** every publication
shows what it was matched to; use the row menu to **link it to a different
book** (a Google Books search) or to **exclude it** from syncing.

If Google Books rate-limits the server during a large first import, the
unmatched books are deferred and matched on the next run instead of being
created from the Tolino data.

## Reading state

The Tolino Cloud stores one bookmark per publication with `progress` (0–1)
and a modification time, and marks finished books with a system tag
(`collection_finished_readings_name`). Retrospine derives:

| Tolino state | Shelf | Milestones |
| --- | --- | --- |
| Never opened | Want to read (if "Add unread books" is on) | – |
| Opened, progress > 0 | Reading | *Started reading* (a second before) and *Progress N %* dated when the bookmark was written |
| Finished tag set, or read past 98 % | Finished | *Finished reading* dated when the tag was set |

On later runs only changes are recorded: a new progress value adds a
*Progress* milestone, a finished mark adds *Finished reading*, and a position
that moved backwards after a book was finished counts as a re-read (a new
*Started reading*). A book you finished or set aside by hand is never moved
backwards, and Tolino data older than your latest milestone is ignored.
Milestones written by the sync carry `source = tolino` and show a small
"tolino" badge on the timeline; you can delete them like any other milestone.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| Sync automatically | on | Include this connection in the scheduled runs |
| Add unread books to "Want to read" | on | Import books you own but have not opened |
| Include audiobooks | off | Also import audiobooks (progress is listening progress) |

## Scheduler

`src/lib/tolino/scheduler.ts` is started from `src/instrumentation.ts` once
per server process. Every five minutes it syncs the connections whose last
run is older than `TOLINO_SYNC_INTERVAL` minutes (default 60) and refreshes
tokens that expire within three hours. Set `TOLINO_SYNC_INTERVAL=0` to turn
automatic syncing off; "Sync now" still works. With several replicas set it
on one of them only.

## Supported bookshops

The list in `src/lib/tolino/resellers.ts` contains the shops that run
accounts in the Tolino Cloud and whose OAuth endpoints answer: Thalia.de,
Thalia.at, Orell Füssli / books.ch, Osiander, bücher.de, Hugendubel, eBook.de,
meineBUCHhandlung, IBS.it and Libraccio. The OAuth endpoints are refreshed
from Tolino's reseller configuration service when a connection is created;
the table is the fallback.

## Endpoints used

There is no public API; the requests mirror the official web reader
(`src/lib/tolino/client.ts`):

| Purpose | Request |
| --- | --- |
| Bookshop OAuth details | `GET bosh.pageplace.de/bosh/rest/v2/resellerconfig` |
| Token refresh | `POST <shop>/auth/oauth2/token` (`grant_type=refresh_token`), sent with a tolino device user agent because the shops block generic clients |
| Devices | `POST bosh.pageplace.de/bosh/rest/handshake/devices/list`, `POST api.pageplace.de/v1/devices` |
| Inventory | `GET api.pageplace.de/v8/inventory?page=…` (paged), fallback `GET bosh.pageplace.de/bosh/rest/inventory/delta` |
| Reading state | `PATCH api.pageplace.de/v4/reading-metadata?paths=publications,audiobooks` with an empty revision (full state), fallback `PATCH bosh.pageplace.de/bosh/rest/sync-data` |

Only the response parsing is covered by unit tests
(`src/lib/tolino/__tests__/parse.test.ts`); the endpoints themselves can only
be exercised with a real account.
