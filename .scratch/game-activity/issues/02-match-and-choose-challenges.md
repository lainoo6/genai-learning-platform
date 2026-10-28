# 02: Add Match and Choose Challenge formats

**What to build:** Instructors can author Match and single-correct Choose Challenges, and learners can complete them in the same Game Activity progression with deterministic answer validation.

**Blocked by:** 01: Build the foundational Game Activity with Sort Challenges.

**Status:** complete

- [x] Support Match pairs and Choose options with exactly one correct option per Choose Challenge.
- [x] Support plausible misconception-based Distractors without numeric scoring or timing mechanics.
- [x] Provide accessible non-drag interaction paths and test both formats through their external behavior.

## Completed

- Added schema and editor support for Match and single-correct Choose challenges.
- Added deterministic server-side validation for Match and Choose submissions.
- Choose distractors are represented explicitly and do not produce numeric scores or timing mechanics.
- Added accessible button-based learner interactions, including incorrect-answer continuation.
- Added external behavior tests for both Match and Choose, plus schema and grading coverage.
- Updated English and Chinese translations and activity digests.
- Verified typechecking, linting, production build, and the full test suite: 29 files and 206 tests passed.

## Commit

`1913201 Add match and choose game challenges`
