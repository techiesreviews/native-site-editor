# Source editor collapse

The horizontal code grip hides the Source editor completely. A click, Enter or
Space toggles between zero height and the remembered expanded height. Home hides
it; End expands to the available maximum. Arrow keys resize in 10px steps, or
40px with Shift. Dragging below half the 96px minimum hides it and preserves the
previous height for restoration. Dragging the collapsed grip into the Editing
preview reopens it at the new height.

The restore grip stays visible as a centred 64px strip inside the preview's
bottom edge, with a 44px touch target. Collapsed code has no residual source tabs
or editors. Hidden content is inert and hidden from accessibility APIs. Focus
returns to the grip when a control inside the Source editor initiates collapse.
The separator exposes zero with `aria-valuenow` and describes the hidden state
with `aria-valuetext`.

Resize positioning has no animation under reduced motion. The independent
vertical splitter between the page and stylesheet code panes retains its minimum
widths and side-by-side minimization behavior. In cramped stacked layouts,
expanded code keeps a 96px source row where available; hiding it returns to zero.

The `astro-editor.code-height` preference keeps the stored height for restoration;
its legacy `collapsed: true` means fully hidden. Resizing never writes page,
stylesheet or draft content.

Focused browser coverage checks zero height, the visible restore grip,
click/drag/keyboard restoration, persisted height, hidden controls outside Tab
navigation, no horizontal overflow, and unchanged source and drafts. Code-width
and Page structure coverage also remain.

Collapse controls apply to the Source editor and Page structure.
