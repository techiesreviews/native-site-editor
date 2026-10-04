// Standalone host page for the master preview browser proof: the real
// createNativePreview and runtime, with no editor, server or repository.
import { createNativePreview, type NativeMasterEditInput } from "../../src/components/native-preview";

const events: unknown[] = [];
const preview = createNativePreview(document.getElementById("host")!, {
  onSelect: (selection) => events.push({ type: "select", path: selection.path, node: selection.node, tag: selection.tag, reason: selection.reason, paintedSource: selection.paintedSource, masterSession: selection.masterSession }),
  onTextEdit: (edit) => events.push({ type: "text-edit", ...edit }),
  onStructure: (structure) => events.push({ type: "structure", structure }),
});
Object.assign(window, {
  events,
  preview,
  start(site: { routes: Record<string, string>; components: Record<string, string> }, sources: Record<string, string>) {
    preview.activate(site);
    preview.update({ sources });
  },
  setMaster(input: NativeMasterEditInput | undefined, sources?: Record<string, string>) {
    preview.update(sources ? { sources, masterEdit: input } : { masterEdit: input });
    return preview.masterEditStatus();
  },
});
