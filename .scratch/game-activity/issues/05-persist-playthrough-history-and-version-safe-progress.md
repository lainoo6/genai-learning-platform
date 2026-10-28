# 05: Persist Playthrough history and version-safe progress

**What to build:** Learner progress survives refresh and Replay, while the server records completion, per-Challenge correctness, first-pass results, retries, Hint use, and timestamps against the exact content version played.

**Blocked by:** 01: Build the foundational Game Activity with Sort Challenges; 02: Add Match and Choose Challenge formats; 03: Add instructional feedback, hints, replay, and accessible interaction states.

**Status:** implemented

- [x] Make the server authoritative and recover Playthrough state after refresh.
- [x] Record completion, per-Challenge correctness, first-pass results, retries, Replays, Hint use, and replay timestamps without overwriting prior history.
- [x] Keep historical results associated with the published content version that was played using immutable content fingerprints and activity snapshots.
- [x] Capture only minimal aggregate learning signals and avoid unnecessary keystroke tracking.

## Implementation update

- Added immutable `contentVersion` fingerprints and full activity snapshots to
  saved `ActivityAttempt` records.
- Added server-derived playthrough IDs, attempt numbers, first-pass flags,
  replay markers, hint records, and timestamped history.
- Added server recovery for the latest playthrough matching the current content
  version; stale attempts from republished content are not hydrated.
- Restored Choose, Match, and Sort state after refresh, including partially
  locked Sort rows.
- Recorded Replay actions as append-only attempts without overwriting history.
- Added focused persistence/version tests and preserved the existing game test
  coverage.

Validation: TypeScript, ESLint, focused tests, and the full suite passed
(214 tests).

Implementation commit: `a70c502` (`Persist version-safe game playthroughs`).

Note: content versions are currently represented by deterministic fingerprints
of the published block snapshot rather than a separate publication-version
database model.
