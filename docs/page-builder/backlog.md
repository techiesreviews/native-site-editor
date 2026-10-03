# Page builder backlog

Found while testing the dev builds in a browser (newest first). Each line: what is
wrong, where it was seen, and the fix to aim for.

- **Canvas too short for building.** The code panes take a third of the height, so a
  card grid's "Add card" is cut off (preview 25270e0c). Add a remembered design mode:
  code folded to a thin bar that shows the selected element's tag, one key to unfold.
- **Card rows say "Block".** The structure tree labels a `card-project` instance
  "Block Fern & Kettle"; it should use the component's name ("Card project").
- **Add panel overlaps the code pane.** The panel is wider than the sidebar it docks
  over and covers the code pane's left edge (`index.html` cut to `x.html`).
- **Selection label under the edit bar.** In tablet view `section.hero` hides under
  the edit bar (canvas slice; sent to its agent).
