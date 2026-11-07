import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface AgentDef {
	name: string;
	description: string;
	tools: string;
	projectAgent: boolean;
	model: string;
	thinking: string;
	systemPrompt: string;
	file: string;
}

export type AgentRuntimeOverrides = Record<string, { model?: string; thinking?: string }>;

export function loadAgentRuntimeOverrides(agentDir: string = getAgentDir()): AgentRuntimeOverrides {
	const path = join(agentDir, "agent-team-models.json");
	if (!existsSync(path)) return {};

	const raw: unknown = JSON.parse(readFileSync(path, "utf-8"));
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid agent runtime config: ${path}`);
	const overrides: AgentRuntimeOverrides = Object.create(null);
	for (const [name, value] of Object.entries(raw)) {
		if (!value || typeof value !== "object" || Array.isArray(value) ||
			(value.model !== undefined && typeof value.model !== "string") ||
			(value.thinking !== undefined && !["off", "minimal", "low", "medium", "high", "xhigh"].includes(value.thinking))) {
			throw new Error(`Invalid runtime settings for ${name} in ${path}`);
		}
		overrides[name.toLowerCase()] = { model: value.model, thinking: value.thinking };
	}
	return overrides;
}

export function resolveAgentRuntime(agent: AgentDef, overrides: AgentRuntimeOverrides): { model: string; thinking: string } {
	if (agent.projectAgent) return { model: agent.model, thinking: agent.thinking };
	const key = agent.name.toLowerCase();
	const override = Object.hasOwn(overrides, key) ? overrides[key] : undefined;
	return { model: override?.model ?? agent.model, thinking: override?.thinking ?? agent.thinking };
}

export interface TeamMember {
	name: string;
	extensions: string[];
}

function parseAgentFile(filePath: string, projectAgent: boolean, useFrontmatterRuntime: boolean): AgentDef | null {
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
			projectAgent,
			model: useFrontmatterRuntime ? frontmatter.model || "" : "",
			thinking: useFrontmatterRuntime ? frontmatter.thinking || "off" : "off",
			systemPrompt: match[2].trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
}

export function scanAgentDirs(cwd: string, home: string = homedir(), agentDir: string = getAgentDir()): AgentDef[] {
	const dirs = [
		{ path: join(cwd, "agents"), project: true, frontmatterRuntime: true },
		{ path: join(cwd, ".claude", "agents"), project: true, frontmatterRuntime: true },
		{ path: join(cwd, ".pi", "agents"), project: true, frontmatterRuntime: true },
		{ path: join(home, ".claude", "agents"), project: false, frontmatterRuntime: true },
		{ path: join(agentDir, "agents"), project: false, frontmatterRuntime: false },
	];

	const agents: AgentDef[] = [];
	const seen = new Set<string>();

	for (const { path: dir, project, frontmatterRuntime } of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const def = parseAgentFile(resolve(dir, file), project, frontmatterRuntime);
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

export function resolveExtensionSource(source: string, home: string = homedir(), agentDir: string = getAgentDir()): string {
	if (source.startsWith("builtin:")) return source;
	if (source === "~") return home;
	if (source.startsWith("~/")) return join(home, source.slice(2));
	if (!source.includes("/")) {
		return join(agentDir, "extensions", source.endsWith(".ts") ? source : `${source}.ts`);
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

export function loadTeams(cwd: string, agentDir: string = getAgentDir()): Record<string, TeamMember[]> {
	const globalTeams = loadTeamsFile(join(agentDir, "agents", "teams.yaml"));
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
	agentDir: string = getAgentDir(),
): string {
	const promptPaths = [
		join(cwd, ".pi", "agents", `${teamName}.dispatcher.md`),
		join(agentDir, "agents", `${teamName}.dispatcher.md`),
	];

	for (const promptPath of promptPaths) {
		if (!existsSync(promptPath)) continue;
		try {
			return readFileSync(promptPath, "utf-8").trim();
		} catch {}
	}
	return "";
}
