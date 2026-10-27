# 01: Build the foundational Game Activity with Sort Challenges

**What to build:** An instructor can create and edit a Game Activity with ordered Sort Challenges, and a learner can play a short activity with visible progress, server-verifiable completion, incorrect-answer continuation, and accessible keyboard controls.

**Blocked by:** None (can start immediately).

**Status:** complete

- [x] Establish the Game Activity and Challenge contract, including Sort's canonical order and a default five-Challenge activity.
- [x] Preserve the intended existing Sort behavior while supporting server-verifiable completion and accessible keyboard interaction.
- [x] Cover schema, result validation, learner behavior, editor behavior, and generation/template seams with external-behavior tests.

## Completed

- Added five-item English and Chinese Sort templates.
- Preserved canonical-order schema validation and server-side result grading.
- Added Arrow Up/Down keyboard movement for focused learner rows.
- Added dependency-free behavior seams and tests for keyboard movement, locked-row continuation, and editor reordering.
- Verified the full test suite, typecheck, and lint.
