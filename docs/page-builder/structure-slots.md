# Component slots in Structure

The canvas no longer shows an Empty slots rail. This removes only the editor overlay: authored slot elements, assignments, fallback content, conditions and native slot reports remain intact. The preview compatibility mount creates no layer, listeners or layout observers.

Instance slot controls are moving into Structure. Their source-guarded host adapter is still pending integration.

`ComponentTools.structure(path, node)` reads an actual page-authored component host. Its immutable descriptors group each template slot name once and include only real assigned element paths for deduplication. Unknown slot assignments remain ordinary Structure rows. Rich content stays Content and selects its authored page element; it is not simplified into a text field.

`PageStructureHandlers.componentSlots` accepts this model. Root Edit and Disconnect actions appear on hover or keyboard focus. Text is inline; image and link fields unfold into labelled details. Optional-slot checkboxes fill/remove page content. Slots with a fallback instead offer Reset, preserving their existing fallback semantics. Ordinary slot selection selects page content without opening the template.

Field sessions capture the originating source, template, scope, mounted model/session and alternative version when focused. Own writes advance the proof. External changes, same-source model replacement and scope changes refuse the write. Focus/caret survive Structure rerenders; closing the field closes the existing text edit group. No-op history receipts supply read-only version proofs and are never applied or recorded as extra Undo actions.

`editingScope()` records successful explicit template entry; it is not inferred from the current filename. `instanceSelection()` resolves shadow selections through the runtime's actual page host path/node and component-template mapping, never by selector guesses. The main host must use this mapping before selecting source and refuse fallback text writes into shared templates outside explicit template editing. Root integration and its real Undo/Redo checks remain pending.
