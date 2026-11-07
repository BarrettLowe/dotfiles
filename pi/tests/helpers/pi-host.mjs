// Use the installed Pi host, including its extension loader and legacy import aliases.
import { execFileSync } from "node:child_process";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = process.env.PI_PACKAGE_DIR || join(
	execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
	"@earendil-works/pi-coding-agent",
);
const hostUrl = pathToFileURL(join(packageDir, "dist/index.js")).href;
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "@earendil-works/pi-coding-agent") {
			return { url: hostUrl, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
});
export const host = await import(hostUrl);
export const { loadExtensions } = await import(
	pathToFileURL(join(packageDir, "dist/core/extensions/loader.js")).href
);
