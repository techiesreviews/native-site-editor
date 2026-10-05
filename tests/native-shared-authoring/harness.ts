import { createNativeSharedAuthoring, type NativeSharedSubmitResult } from "../../src/components/native-shared-authoring";
const calls: unknown[] = [];
const authoringClosed: unknown[] = [];
const pending: ((result: NativeSharedSubmitResult) => void)[] = [];
const linkCalls: unknown[] = [];
const actions = {
  submit: (metadata: import("../../src/components/native-shared-authoring").NativeSharedMetadata, contextKey: string) => { calls.push({ metadata, contextKey }); return new Promise<NativeSharedSubmitResult>(resolve => pending.push(resolve)); },
  close: (contextKey: string, reason: "cancel" | "saved") => authoringClosed.push({ contextKey, reason }),
};
let authoring = createNativeSharedAuthoring({ ...actions, link: (recordId, contextKey) => { linkCalls.push({ recordId, contextKey }); return new Promise<NativeSharedSubmitResult>(resolve => pending.push(resolve)); } });
document.getElementById("host")!.append(authoring.element);
Object.assign(window, { authoring, calls, linkCalls, authoringClosed, legacy() { authoring.destroy(); authoring = createNativeSharedAuthoring(actions); document.getElementById("host")!.append(authoring.element); Object.assign(window, { authoring }); }, finish(index: number, result: NativeSharedSubmitResult) { pending[index](result); } });
