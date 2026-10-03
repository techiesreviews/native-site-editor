# Visible code while editing

Code splitters minimize source panes rather than hiding them. The horizontal
separator keeps a 128px pane in ordinary layouts (including its tabs), with at
least 96px in short layouts and a canvas reserve. Only a physically smaller
parent reduces that minimum further, while retaining at least 48px of actual
source plus its title. When source and the canvas reserve cannot both fit,
the containing layout scrolls rather than shrinking source to zero. The editor,
source model, cursor, draft and history stay mounted. Restore returns to the
remembered height. Dragging below the minimum and Home minimize; Enter/Space
restore. Arrow keys resize from the displayed height and End expands to the bound.

The secondary source pane remains visible when minimized, keeping up to 160px
(or half the available width in narrower layouts). Its width separator remains
available. The host can still close a secondary file explicitly; that is separate
from minimizing an open editor. Both splitters retain their existing persisted
`collapsed` flags, interpreting old saved states as minimized states. Palette
commands say “Minimize code” and “Restore code”. No host API or source workflow is
added by this leaf.

The focused browser suite verifies legacy persistence, drag and keyboard restore,
actual Monaco viewport visibility, model/cursor/history retention, palette copy,
secondary source visibility, and narrow layouts. The existing resize suite retains
sidebar, edit-bar placement, selection and focus checks under the new code policy.
