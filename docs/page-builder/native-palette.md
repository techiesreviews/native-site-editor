# Native element palette seam

The palette accepts optional `nativeElements(): readonly AddChoice[]` with native
catalogue `tag`, `label`, `group`, and `kind: "native"`. These produce distinct
`native.add:native:*` commands in Elements, without component template navigation.
Cmd+K and action search include them; `/` pages and Cmd+P navigation exclude them.

Optional synchronous `nativeInsertPoint(source, path, selection, choice)` returns
`{path?, parent, index}`. A host point carrying the current path is passed intact
to the existing `insert(point, {tag, label})` callback, preserving host object-based
source proofs. The host still owns atomic source application and Undo. Without
that callback, conservative native destinations choose valid inside, then after
selection; an unselected page uses main end. Actual native markup insertion must
validate the source boundary in every case; repaired or opaque destinations refuse.

Commands capture current page, full source, revision and selection. They check that
snapshot before and after synchronous placement, and refuse stale commands without
inserting. This leaf does not wire main's catalogue or guarded insertion callback.
