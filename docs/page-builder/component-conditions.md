# Template visibility conditions

Open a component template using Edit component, then choose Visibility conditions in the existing template banner. The source target lists template slots and existing `data-if` wrappers. Select every slot required to show that target. These conditions affect all instances; page-instance slot controls remain separate. Fallback content never satisfies a requirement.

Save performs one guarded start-tag replacement through the mounted native Monaco editor. Undo and Redo use the existing editor history. Remove condition is explicit. Unknown names and duplicate requirements are reported. The dialog retains choices when source, repository revision, component mapping, editor, selection, or preview context changes; close and reopen to review the new source. No asynchronous file opening is needed for this operation.

`readSlotConditions` reads source targets with element-child paths. `planSlotCondition` returns `expectedSource`, the exact original start-tag `expected` slice, and one range replacement. Consumers must check the full source and captured context before using the plan. Attribute lexing uses HTML ASCII whitespace; unrelated quotes, entities, whitespace, attribute order, and all other source bytes are preserved. An unnamed slot can require itself with bare `data-if`; it cannot be named in a conjunction.

## Existing runtime limitation

The requested model treats empty `data-if` on an ordinary element as an empty conjunction (visible). The current production preview runtime at `public/native-preview-runtime.js:1697` instead splits an empty string into one empty slot name, normally hiding the element. This task prohibits runtime edits. The dialog blocks saving an empty ordinary-element condition with an explanation and retains the input. Empty ordinary-element conditions therefore have model coverage but cannot be claimed to have matching production behavior until that host/runtime seam is fixed. Named conditions and bare slot conditions use the existing production behavior.

## Validation

Focused units cover exact source preservation, entities and NBSP attribute names, guards, unknown and duplicate requirements, AND truth tables, fallback, bare slots, and ordinary empty conditions. Production browser tests cover native Monaco source bytes, real Undo/Redo, keyboard initial focus and Escape, source, repository, file-context and selection rejection with retained input, and hidden/visible shared-template behavior across three instances.
