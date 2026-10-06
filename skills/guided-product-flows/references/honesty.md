# Honesty: nothing on screen claims more than the data behind it

Every pattern here was found in a real app, usually more than once, and
usually behind something that looked cosmetic. They matter more than visual
bugs, because they put invented content into the user's own record or show
them a confidence they haven't earned.

## 1. Fiction with a button on it

A fixture list ("Distribution Network", "Campus Ambassador Program") had a
**+** button that wrote the fixture into the user's real map, under a badge
reading **Live · synced**. A "Placeholder transcript" had **Pin** buttons that
added invented quotes to a persona's evidence.

**Rule:** a fixture is never reachable by a control that writes. Show it with
the button removed, or don't show it. A label admitting it is fake doesn't
cancel a button that makes it real, because the label is read once and the
button is pressed later.

**Find it:** flow-audit flags sample arrays in files that write state. Check
each one: can any button put this into the user's data?

## 2. The counter that replaced the thing it counted

`handleAddEvidence(src, _quote)` threw the quote away and incremented a count.
So the "evidence trail" showed N identical rows with nothing behind them, a
maturity score rose on nothing, and a real interview line and a fixture were
worth the same.

**The tell:** a parameter renamed with a leading underscore in a handler that
seems to record something. That is the compiler being told to stop asking
why the data goes nowhere. flow-audit flags these.

## 3. Metrics that can't be earned

A "fit score" computed its own numerator (`Math.ceil(total / 2)`), so it sat
near 50 forever while the copy promised "validate to push past 80".

**Rule:** a number shown to a user must come from real state and must be
movable by an action they can take. If there's nothing to measure yet, say so
("4 of 9 blocks filled") rather than rendering a plausible-looking number.

## 4. Claims the data doesn't back

An investor email template always said "we've validated key unit economics
and assembled an investor-ready deck", for a venture with neither.

**Rule:** generated copy (emails, summaries, badges, exports) includes each
claim only when the work behind it exists, with the real number: "tested
demand with 50 real customers", not "validated demand".

## 5. Work that arrives unjudged

Ideas land unscored, backlog items land "Unset", claims land "assumed". An
unscored idea is invisible on the matrix: stalled, not parked.

**Rule:** when items arrive unjudged, the tool asks for the judgement. It
says what is outstanding, offers to walk through one at a time, and advances
automatically when each call is made.

## 6. One fact, computed in four places

"How far along is this, and what's next?" was implemented four times, and the
copies disagreed: one hardcoded a step as never done, another skipped setup,
so a new user was sent to a step with nothing to read from.

**Rule:** one function owns a derived fact. Components own its presentation,
never its computation. **The tell:** two screens that disagree about the
same fact.

## 7. One relationship, two directions

One tool could push an idea into the backlog; the backlog had an "Import"
doing the same from the other end.

**Rule:** work moves forward by **push** from the tool that produced it, or
is chosen by **source-selection** on the tool that consumes it. An "import"
that pulls backwards is not a third pattern.

## 8. Safety nets that never fire

A retry-on-5xx wrapper never retried, because the error it inspected had no
`status` property. It covered every AI call in the app.

**Rule:** if code exists to handle failure, prove it runs. Write a test that
fails when the fix is reverted.

## 9. Failure that pretends to succeed

On error, a generator "fell back" to a canned plan, a sample list or a
template thesis, and showed it as if it had been generated.

**Rule:** on failure, show the error and change nothing. "Nothing was changed.
Try again." A canned result shown as generated is the bug.

## 10. Links nothing ever writes

A view model declared `profileId` so a change to that persona could flag the
canvas built on it. No code ever set it, so the staleness check guarding it
could never fire, and the feature looked finished in review.

**Rule:** every field another tool reads from must have a writer. Grep each
link field (`*Id`, `basedOn*`, `source*`) in the types for an assignment.
A field that is declared and read but never written is a dead link.

## 11. The input picked for the user

`profiles[0]` and `businessModels[0]`: the tool silently used whichever item
came first. With two personas, half the outputs were built on the wrong one,
and nothing on screen said which was used.

**Rule:** when there can be more than one upstream item, the user chooses it
and the tool shows which one it used ("Built on: Student renter"). `[0]` on a
user's list is a choice made for them.

## 12. Writes that go around the state

A delete went straight to the database while the app's state still held the
item, so the next autosave brought it back. A financial model lived only in
component state and was lost on reload.

**Rule:** every write goes through the one state path that saves and records
edits. A direct database call in a component, or user work held only in
local component state, is data that will be lost or resurrected.
