import { createNativeSharedAuthoring, type NativeSharedSubmitResult } from "../../src/components/native-shared-authoring";
const calls: unknown[] = [];
const authoringClosed: unknown[] = [];
const pending: ((result: NativeSharedSubmitResult) => void)[] = [];
const authoring = createNativeSharedAuthoring({
  submit: (metadata, contextKey) => { calls.push({ metadata, contextKey }); return new Promise(resolve => pending.push(resolve)); },
  close: (contextKey, reason) => authoringClosed.push({ contextKey, reason }),
});
document.getElementById("host")!.append(authoring.element);
Object.assign(window, { authoring, calls, authoringClosed, finish(index: number, result: NativeSharedSubmitResult) { pending[index](result); } });
