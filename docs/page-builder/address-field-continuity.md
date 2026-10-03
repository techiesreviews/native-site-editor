# Address field continuity

Open edit-bar fields retain their input and caret only for the same element,
source path, editor revision and field meaning. Source changes from typing can
refresh the handlers without reopening the field. Selection or session changes
close the old field before opening another, even when both controls are named
Name. Address controls may provide an optional stable `identity` to distinguish
field meanings with shared labels; the opening control owns its close callback.
