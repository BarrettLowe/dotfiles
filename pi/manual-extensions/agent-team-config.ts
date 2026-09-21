import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface AgentDef {
	name: string;
	description: string;
	tools: string;
	model: string;
	thinking: string;
	systemPrompt: string;
	file: string;
}

export interface TeamMember {
	name: string;
	extensions: string[];
}

function parseAgentFile(filePath: string): AgentDef | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (!match) return null;

		const frontmatter: Record<string, string> = {};
		for (const line of match[1].split("\n")) {
			const idx = line.indexOf(":");
			if (idx > 0) {
				frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}

		if (!frontmatter.name) return null;

		return {
			name: frontmatter.name,
			description: frontmatter.description || "",
			tools: frontmatter.tools || "read,grep,find,ls",
			model: frontmatter.model || "",
			thinking: frontmatter.thinking || "off",
			systemPrompt: match[2].trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
}

export function scanAgentDirs(cwd: string, home: string = homedir()): AgentDef[] {
	const dirs = [
		join(cwd, "agents"),
		join(cwd, ".claude", "agents"),
		join(cwd, ".pi", "agents"),
		join(home, ".claude", "agents"),
		join(home, ".pi", "agent", "agents"),
	];

	const agents: AgentDef[] = [];
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const def = parseAgentFile(resolve(dir, file));
				if (def && !seen.has(def.name.toLowerCase())) {
					seen.add(def.name.toLowerCase());
					agents.push(def);
				}
			}
		} catch {}
	}

	return agents;
}

export function parseTeamsYaml(raw: string): Record<string, TeamMember[]> {
	const teams: Record<string, TeamMember[]> = {};
	let current: TeamMember[] | null = null;
	let currentMember: TeamMember | null = null;
	let memberIndent = -1;
	let extensionsActive = false;

	for (const line of raw.split("\n")) {
		const teamMatch = line.match(/^(\S[^:]*):$/);
		if (teamMatch) {
			current = [];
			teams[teamMatch[1].trim()] = current;
			currentMember = null;
			memberIndent = -1;
			extensionsActive = false;
			continue;
		}

		if (currentMember && line.match(/^\s+extensions:\s*$/)) {
			extensionsActive = true;
			continue;
		}

		const itemMatch = line.match(/^(\s*)-\s+(.+)$/);
		if (!itemMatch || !current) continue;
		const indent = itemMatch[1].length;
		const value = itemMatch[2].trim();

		if (memberIndent === -1 || indent <= memberIndent) {
			memberIndent = indent;
			currentMember = {
				name: value.endsWith(":") ? value.slice(0, -1).trim() : value,
				extensions: [],
			};
			current.push(currentMember);
			extensionsActive = false;
		} else if (extensionsActive && currentMember) {
			currentMember.extensions.push(value);
		}
	}
	return teams;
}

export function resolveExtensionSource(source: string, home: string = homedir()): string {
	if (source === "~") return home;
	if (source.startsWith("~/")) return join(home, source.slice(2));
	if (!source.includes("/")) {
		return join(home, ".pi", "agent", "extensions", source.endsWith(".ts") ? source : `${source}.ts`);
	}
	return source;
}

function loadTeamsFile(path: string): Record<string, TeamMember[]> {
	if (!existsSync(path)) return {};
	try {
		return parseTeamsYaml(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

export function loadTeams(cwd: string, home: string = homedir()): Record<string, TeamMember[]> {
	const globalTeams = loadTeamsFile(join(home, ".pi", "agent", "agents", "teams.yaml"));
	const projectTeams = loadTeamsFile(join(cwd, ".pi", "agents", "teams.yaml"));
	return { ...globalTeams, ...projectTeams };
}

export function resolveInitialTeam(
	teams: Record<string, string[]>,
	requestedTeam?: string,
): string {
	if (requestedTeam && Object.hasOwn(teams, requestedTeam)) return requestedTeam;
	return Object.keys(teams)[0] || "";
}

export function loadTeamDispatcherPrompt(
	cwd: string,
	teamName: string,
	home: string = homedir(),
): string {
	const promptPaths = [
		join(cwd, ".pi", "agents", `${teamName}.dispatcher.md`),
		join(home, ".pi", "agent", "agents", `${teamName}.dispatcher.md`),
	];

	for (const promptPath of promptPaths) {
		if (!existsSync(promptPath)) continue;
		try {
			return readFileSync(promptPath, "utf-8").trim();
		} catch {}
	}
	return "";
}
