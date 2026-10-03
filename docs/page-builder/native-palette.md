# Native element palette seam

The palette accepts optional `nativeElements(): readonly AddChoice[]` with native
catalogue `tag`, `label`, `group`, and `kind: "native"`. These produce distinct
`native.add:native:*` commands in Elements, without component template navigation.
Cmd+K and action search queries include them; the empty palette omits native Add suggestions; `/` pages and Cmd+P navigation exclude them.

Optional synchronous `nativeInsertPoint(source, path, selection, choice)` returns
`{path?, parent, index}`. A host point carrying the current path is passed intact
to the existing `insert(point, {tag, label})` callback. Object-based source proofs
still require a host adapter that passes this object through without spreading or
replacing it; the existing main adapter has not been wired or verified here. The host owns atomic source application and Undo. Without
that callback, conservative native destinations choose valid inside, then after
selection; an unselected page uses main end only when the source destination itself is main. Actual native markup insertion must
validate the source boundary in every case; repaired or opaque destinations refuse.

Commands capture current page, full source, revision and selection. They check that
snapshot before and after synchronous placement, and refuse stale commands without
inserting. This leaf does not wire main's catalogue or guarded insertion callback.
