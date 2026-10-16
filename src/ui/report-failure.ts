// Where async UI work sends a rejection nobody awaits: main.ts points this at the editor's
// notice bar at start-up (setErrorReporter); before that it logs. No DOM or asset imports,
// so controllers and node tests can load it as is.
let errorReporter: (error: unknown) => void = (error) => console.error(error);

export function setErrorReporter(report: (error: unknown) => void) {
  errorReporter = report;
}

export function reportFailure(error: unknown) {
  errorReporter(error);
}

// Wraps an async DOM handler for addEventListener, setTimeout or a `() => void` slot.
// The handler runs synchronously (preventDefault still works); a rejection is reported.
export function reported<Args extends unknown[]>(handler: (...args: Args) => void | Promise<void>): (...args: Args) => void {
  return (...args) => {
    const result = handler(...args);
    if (result && typeof result.then === "function") void result.catch(reportFailure);
  };
}
