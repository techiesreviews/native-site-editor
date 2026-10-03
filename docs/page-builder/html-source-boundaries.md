# Shared HTML lexical boundaries

The source tokenizer uses HTML's five whitespace characters: tab, LF, form feed,
CR and space. NBSP, vertical tab and BOM remain name/value/text characters. Tag
and attribute names fold ASCII uppercase letters only; Unicode letters retain
case and UTF-16 lengths, preserving exact source offsets. Annotation attributes
are inserted after the complete tokenized tag name, including non-ASCII characters.

Element-end matching accepts HTML name delimiters and refuses an unrelated end
name separated by Unicode whitespace. Text-selection balance uses the same lexical
name boundaries. A single-section component template may have comments and HTML
whitespace around it, but nonblank Unicode text disqualifies it. Raw-text closing
boundaries and entity decoding retain their existing behavior.

This is a lexical scanner rather than an HTML tree-repair or foreign-namespace
parser. Source operations must keep their own semantic/context guards before
editing; annotation or tokenization alone does not authorize an edit.

`tests/html-boundaries.test.ts` checks names, values, exact range offsets, balanced
text-selection refusal, Unicode case and section boundaries. The browser fixture
compares production scanning/marking/ranges with the actual HTML DOM parser,
including NBSP/VT/BOM and dotted capital I. The full unit suite covers existing
raw text, attributes, entities, source locations, component generation and moves.
