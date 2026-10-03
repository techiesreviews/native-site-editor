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
# Caller offset consistency

Component source names and unquoted attributes use HTML ASCII whitespace and
ASCII case folding. Raw-text closing searches preserve UTF-16 offsets and reject
longer or Unicode-suffixed closing names. Page creation and page-title rewriting
use the same offset-preserving fold, so `İstanbul` in titles, headers or footers
does not shift an edit into adjacent source. This is a lexical correction, not
a tree-repair or namespace-parser replacement.

Legacy `data-key` cleanup now removes parsed attribute ranges only, leaving
lookalikes inside quoted values or Unicode-containing unquoted values intact.
Native document closing searches recognize HTML ASCII delimiters, including
legal slash or attributed end tags.

Fallback filling now copies element bytes without whole-markup whitespace
compaction. Only deliberate slot assignment and actual legacy `data-key` removal
change their attributes. Multiple elements retain their intervening source gaps;
pure text trims only exterior HTML ASCII whitespace and preserves NBSP and
internal spacing. Insertion adds surrounding indentation without rewriting the
copied content. Production fill-to-insertion DOM checks compare attribute values,
`pre` text, textarea values, script/style text and source bytes. This remains
separate from general HTML tree repair and global plain-text normalization.
