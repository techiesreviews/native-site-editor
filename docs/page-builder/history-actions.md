# External visual history actions

`recordHistoryAction(path, undo, redo?)` records a host operation in the mounted
file's visual history session. Existing two-argument calls remain one-time Undo
steps. A supplied Redo callback makes the entry reversible. Later visual text edits
remain above the action: Undo text, Undo action, Redo action, Redo text. Ordinary
manual typing retains its existing behavior of clearing visual history; Monaco's
own text history remains available.

Callbacks return `void`, `boolean`, or a promise of either. `false` refuses the
operation and keeps the entry on its current stack. A thrown error or rejected
promise also keeps the entry and propagates to the caller; host callbacks should
catch operational errors and announce them when invoked from toolbar commands.
Success moves the entry between Undo and Redo only after the callback completes.
Legacy actions are removed after successful Undo and clear the Redo stack.

Each history session permits one running Undo/Redo. Reentrant calls return false.
After awaiting a callback, the controller verifies the exact journal object, its
current top entry and the initiating mounted editor/session. Clearing history,
adding a newer entry or replacing the mounted workspace prevents stale completion
from popping or appending entries. The lock is released even on error.

The controller does not decide whether a callback's side effects are valid. An
operation receipt must check its original repository/branch revision, expected
source and exact owned draft identity before restoring or removing anything. It
must handle its own rollback and return false when refused. A callback that changes
the mounted workspace or clears/replaces the journal can complete its side effects,
but does not receive a Redo entry in the replacement workspace.

Callbacks that restore mounted text through ordinary agent/model writes invalidate
visual history by design. Use existing visual text edits with history companions
for model changes; do not suppress all model notifications while awaiting a receipt,
since a concurrent agent change must still invalidate stale history. The host batch
transaction must preserve that distinction when combining source and draft history.

`tests/native-save/native-history-action.spec.ts` mounts the real Monaco editor and
uses the production journal. It covers legacy behavior, action/text ordering,
false refusals in both directions, throw/rejection recovery, reentrant calls,
replacement journals and async Undo/Redo across mounted session changes. Existing
component creation tests continue to validate model history with owned file
companions.
