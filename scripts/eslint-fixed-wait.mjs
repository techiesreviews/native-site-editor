// Lint rule: a browser test waits on what the page shows, not on a timer. See docs/agents/guardrails.md, "Fixed waits".
// The scan is scripts/check-specs.mjs's fixedWaits, so the reasons it accepts stay one rule.
import { fixedWaits } from "./check-specs.mjs";

/** @type {import("eslint").Rule.RuleModule} */
const noFixedWait = {
  meta: {
    type: "problem",
    docs: { description: "Disallow timer waits in browser tests without a stated reason" },
    messages: {
      wait: 'Fixed wait: wait on what the page shows (expect, expect.poll or a locator), or put "// fixed-wait: <reason>" on the wait or the line above.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const lines = context.sourceCode.lines;
        for (const line of fixedWaits(context.sourceCode.text)) {
          context.report({ loc: { start: { line, column: 0 }, end: { line, column: lines[line - 1].length } }, messageId: "wait" });
        }
      },
    };
  },
};

export default { rules: { "no-fixed-wait": noFixedWait } };
