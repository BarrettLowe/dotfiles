import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import readGuard from "./read-guard.ts";
import skillInject from "./skill-inject.ts";
import thinkingBudget from "./thinking-budget.ts";

export default function localModelSupport(pi: ExtensionAPI) {
	readGuard(pi);
	skillInject(pi);
	thinkingBudget(pi);
}
