# Books, search and series

## Search

The search page (`src/components/search/search-view.tsx`) debounces input
by 350 ms and calls `/api/books/search?q=…`. The route
(`src/app/api/books/search/route.ts`):

1. requires a session,
2. queries Google Books (`searchVolumes` in `src/lib/books/google-books.ts`,
   40 results, `printType=books`),
3. collapses the editions of each work into one result (see below),
4. joins the results with books already in the database and the current
   user's shelf entries, so results that are already on a shelf show their
   status instead of the add buttons.

Adding a result calls the `addGoogleBookAction` server action, which imports
the volume if necessary and creates the shelf entry.

### One result per work

Google Books lists every edition it knows (hardcover, paperback, e-book,
translations, reissues), so a search for "Red Rising" used to fill the page
with the same book. `collapseEditions` (`src/lib/books/editions.ts`) groups
the results by a title key plus the first author's surname, because Google
has no work identifier:

- `workTitleKey` lower-cases the title, strips accents and punctuation,
  bracketed asides (`(Red Rising Series Book 1)`) and volume markers
  (`Book 1`, `Vol. 2`, `#3`), and drops a subtitle when it only describes
  the edition or the series (`A Novel`, `Book 2 of the Red Rising Saga`).
  Subtitles that name a different book are kept, so `Dune: House Atreides`
  and `Dune: House Harkonnen` stay apart, as do box sets and graphic novels.
- Within a group the edition in the reader's preferred language ranks first
  (an edition of unknown language ranks between a match and a mismatch),
  then the one with a cover, an ISBN, series information, a description and
  a page count, then the one Google ranked higher. Groups keep the order in
  which they first appeared.
- A book the reader already has on a shelf represents its group whatever its
  language, so the result shows the shelf status.
- The series reference is pooled: the group carries the Google series id and
  volume number of the best edition that reports one, so the main result
  shows "Book 1 of …" even when the shown edition lacks the information. The
  name appears once a stored series carries the id (Google never names a
  series).

The response reports how many editions were merged and the language of the
shown edition; the page mentions the language only when it differs from the
preferred one.

### Preferred language

Each reader chooses a language in *Settings → Profile*
(`user.preferred_language`, an ISO 639-1 code). Without a choice, the most
preferred language of the browser's `Accept-Language` header is used. The
helpers and the list of offered languages live in `src/lib/languages.ts`.

### Keeping the pooled series reference

When a result is added or opened, the search passes the pooled reference
along (`addGoogleBookAction(googleId, status, series)` and
`/books/google/<id>?series=…&position=…`). `findOrCreateBookByGoogleId`
stores it on volumes that carry none of their own. `adoptGoogleSeries`
(`src/lib/books/series.ts`) backfills it on books stored earlier: the book
joins a series that already carries the id, or the series it belongs to
learns the id, and other volumes sharing the id are linked. The search route
applies the same backfill to stored books it comes across, so a book imported
before its series was known catches up the next time it turns up in a search.

## Google Books client

- Requests always carry a `country` parameter (`GOOGLE_BOOKS_COUNTRY`,
  default `US`). Google answers `503 Service temporarily unavailable` for IP
  ranges it cannot geolocate, which is common for servers and VPNs; the
  parameter avoids that.
- `500`, `502`, `503` and `504` answers are retried twice (after 250 ms and
  750 ms). The search page retries once more after 1.5 s before showing an
  error.
- `429` and `403` mean the daily quota for the server's IP is used up. Set
  `GOOGLE_BOOKS_API_KEY` to get a per-project quota.
- Results are normalized by `normalizeVolume`: ISBN-13 and ISBN-10 are
  picked from `industryIdentifiers`, cover links are rewritten to https
  without the page-curl decoration and with `zoom=2` for the larger
  rendition, and Google's undocumented `seriesInfo` block is kept as the
  series id and volume number.
- Responses are cached by Next for one hour (searches) or one day (single
  volumes).

## Importing a book

`findOrCreateBookByGoogleId` (`src/lib/library.ts`) stores a volume once,
keyed by its Google id, and then runs series discovery. Books are shared
between users; only shelf entries are per user. Visiting
`/books/google/<id>` imports a volume on demand and redirects to its page,
which is how "more from this series" links work for books nobody has added
yet.

## Series resolution

Google Books rarely knows the series *name*, so several sources are
combined (`src/lib/books/series.ts`):

1. **Open Library** – the edition is looked up by ISBN-13, then ISBN-10
   (`https://openlibrary.org/isbn/<isbn>.json`). Editions carry a free-text
   `series` list such as `Harry Potter, #1` or `Discworld (3)`.
   `parseSeriesString` understands the common shapes
   (`Name, #3`, `Name (3)`, `Name #3`, `Name ; 3`, `Name, Book 3`,
   `Name Vol. 3`, `Book 3 of Name`) and ignores numbers that are part of the
   title (`Fahrenheit 451`). The first entry with a position wins.
2. **Google Books series id** – when Google reports a series id (on the
   volume itself, or pooled from another edition by the search) and a series
   with that id already exists (because another volume was named), the book
   joins it. The Google volume number is used when Open Library has none.
3. **Manual** – the book page has an *Edit series* dialog. Entering a name
   creates or reuses a series (matched case-insensitively) and stores the
   position; an empty name removes the book from its series.

Whenever a series gains a Google id, other books that share that id but have
no series yet are linked to it. Source and position are stored on the book
(`series_source`, `series_position`).

Series lookups are best effort: a failing Open Library request is logged and
the book is still imported.

## Other volumes

`getSeriesVolumes` builds the "More from …" strip on the book page:

1. Books in the database that belong to the same series, with the current
   user's shelf status.
2. A Google Books search for `"<series name>" inauthor:"<author>"` (40
   results). If Google knows the series id and at least two results share
   it, only those are used; otherwise all results are candidates.
3. Box sets, omnibus editions and similar are dropped
   (`BOX_SET_PATTERN`), and editions of the same book are collapsed by a
   normalized title key that strips subtitles, the series name and volume
   markers.
4. Volumes are sorted by position, then by publication date, and capped at
   24.

The strip streams in through `Suspense`, so the rest of the page is not
delayed by the external lookups.
