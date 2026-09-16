# Shelves and milestones

## Shelves

Every book on a user's shelves has exactly one status:

| Status | Label in the UI |
| --- | --- |
| `want_to_read` | Want to read |
| `reading` | Reading |
| `finished` | Finished |
| `abandoned` | Set aside |

Adding a book from search or from a book page puts it on the chosen shelf.
Status can be changed by hand from the dropdown on the book page, or it
changes automatically when milestones are recorded.

## Milestone types

| Type | Label | Extra fields | Moves the book to |
| --- | --- | --- | --- |
| `started` | Started reading | – | Reading |
| `progress` | Progress | page and/or percent | Reading |
| `note` | Note | note (required) | unchanged |
| `finished` | Finished reading | – | Finished |
| `abandoned` | Set aside | – | Set aside |

Every milestone may carry a note (up to 2000 characters). Changing the
status by hand records the matching milestone (`started`, `finished` or
`abandoned`); moving a book back to *Want to read* records nothing.

## Dates

Milestones are entered as dates. A milestone dated today is stored with the
current time, so it sorts after events recorded earlier the same day (for
example the automatic *Started reading* created when you press *Start
reading*). Other dates are stored at noon local server time to keep the
calendar day stable across time zones.

## Progress

`deriveProgress` (`src/lib/reading.ts`) turns the timeline into the progress
bar shown on the reading shelf and on the book page:

- The newest event decides. Ties are broken by creation time.
- `finished` → 100 %.
- The most recent `progress` marker after the last `started` sets the value;
  a page is converted to a percentage using the page count and vice versa.
- A `started` with no later progress → 0 % (this is how a re-read resets).

## Re-reads and sessions

The timeline can contain several `started` / `finished` pairs.
`deriveSessions` pairs each `started` with the next `finished` or
`abandoned` and computes the number of days; the book page shows "Read in
N days" for the last completed session.

## Deleting

Milestones can be deleted from the timeline (with a confirmation). Deleting
does not change the shelf status. Removing a book from the shelves deletes
its entry and all of its milestones.
