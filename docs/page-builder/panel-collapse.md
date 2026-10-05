# Code and Style panel collapse

The horizontal code grip and right Style grip both hide their panel completely.
A click, Enter or Space toggles between zero size and the remembered expanded
size. Home hides the panel; End expands to the available maximum. Arrow keys
resize in 10px steps, or 40px with Shift. Dragging into the collapse threshold
hides the panel and keeps its previous size for a later click restoration.
Dragging a collapsed grip back into the canvas reopens the panel at the new size.

The restore grips stay visible as centred 64px strips inside the canvas's bottom
and right edges. The remaining edge stays available for iframe scrollbars; touch
targets are 44px thick. Code
has no residual source tabs or editors when collapsed. Style has no 32px rail or
vertical opener. Hidden content is inert and hidden from accessibility APIs;
focus returns to the grip when a control inside a panel initiates its collapse.
At rest, Style uses the same faded thin bar as the other grips. Its chevron
appears on hover, keyboard focus or press, and pressing Style highlights only
its own grip.
The separator exposes zero with `aria-valuenow` and describes the hidden state
with `aria-valuetext`; it does not use the unsupported `aria-expanded` attribute.

Expanded code has a 96px minimum where space permits and snaps to hidden below
half that height. Style keeps its existing available-width minimum and half-size
collapse threshold. Resize positioning has no animation under reduced motion.
The independent vertical splitter between the page and stylesheet code panes
retains its existing minimum widths and side-by-side minimization behavior.

Preferences keep the existing `astro-editor.code-height`,
`astro-editor.style-width` and `astro-editor.style-width-last` keys. The code
preference's legacy `collapsed: true` now means fully hidden, and its stored
height remains available for restoration. Panel resizing never writes page,
stylesheet or draft content.

Focused browser coverage uses the native-demo fixture at 1440px and 390px, checks zero panel
sizes, visible restore grips, click/drag/keyboard restoration, persisted heights
and widths, hidden controls outside Tab navigation, no horizontal overflow and
unchanged source/drafts. The existing code-width and Page Structure tests remain
part of the focused validation.

Restoring Style in a narrow viewport clamps its effective width without replacing
the remembered desktop width. In cramped stacked layouts, expanded code keeps a
96px source row where available; hiding it still returns to zero. Short Style
docks scroll their body instead of painting controls over the source row.
