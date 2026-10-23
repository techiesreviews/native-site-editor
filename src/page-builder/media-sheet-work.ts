/**
 * A Media sheet's work as its pane closes (src/page-builder/media-library-view.ts): a modal (the
 * picker) cancels it; the Media pane closes on a switch, which cancels its work but not an Improve
 * images row under way (`finishes`, ticket 23), which finishes in its workspace.
 */
export function closeSheetWork(sheet: { work?: AbortController; finishes?: AbortController }, modal: boolean) {
  if (modal || sheet.work !== sheet.finishes) sheet.work?.abort();
}
