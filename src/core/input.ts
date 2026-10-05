import { join } from "node:path";
import { parse } from "yaml";
import { success } from "#types/data";
import type { Configs, Input, RawInput, Tld } from "#types/input";
import { Checker } from "#types/input";
import { toActionCallback } from "#types/progress-action";
import { toStepCallback } from "#types/progress-step";
import type { Progress } from "./progress";

export const DEFAULT_CONFIGS: Configs = {
	checkers: [Checker.RDAP, Checker.WHOIS, Checker.DNS],
	chunkSize: 5,
	reqRetries: 3,
	reqRetryBackoff: 1.5,
	reqTimeout: 5000,
	stdoutLimit: 20,
};

/** Tld before default checkers applied */
interface PartialTld {
	suffix: string;
	checkers?: Checker[];
}

/** Partially merged input, configs are not filled with defaults yet */
interface MergedInput {
	configs: Partial<Configs>;
	tlds: PartialTld[];
	names: string[];
}

const EMPTY_INPUT: MergedInput = { configs: {}, tlds: [], names: [] };

const toPath = (dir: string, name: string) =>
	join(dir, name.endsWith(".yaml") ? name : `${name}.yaml`);

const readFile = toStepCallback(
	async (path: string) => {
		const file = Bun.file(path);
		if (!(await file.exists()))
			throw new Error(`Input file not found: ${path}`);
		return (parse(await file.text()) ?? {}) as RawInput;
	},
	{
		getName: (path) => `readFile(${path})`,
		getSettings: () => ({ retry: 0 }),
		getStopMsg: (raw) => {
			const ext = raw?.extends?.length ?? 0;
			const tlds = raw?.tlds?.length ?? 0;
			const names = raw?.names?.length ?? 0;
			return `Read ${ext} extend(s), ${tlds} tld(s), ${names} name(s)`;
		},
	},
);

const normalizeCheckers = (location: string, checkers: unknown): Checker[] => {
	const supported = Object.values(Checker) as string[];
	if (!Array.isArray(checkers) || checkers.length < 1)
		throw new Error(
			`Checkers of ${location} must be non-empty list, supported: ${supported.join(", ")}`,
		);
	for (const checker of checkers) {
		if (!supported.includes(checker))
			throw new Error(
				`Invalid checker '${checker}' of ${location}, supported: ${supported.join(", ")}`,
			);
	}
	return [...new Set(checkers)] as Checker[];
};

const normalizeConfigs = (
	path: string,
	configs: RawInput["configs"],
): Partial<Configs> => {
	if (configs?.checkers === undefined) return configs ?? {};
	return {
		...configs,
		checkers: normalizeCheckers(`configs in ${path}`, configs.checkers),
	};
};

const normalizeTlds = (path: string, tlds: RawInput["tlds"]): PartialTld[] => {
	return (tlds ?? []).map((tld) => {
		const suffix = String(tld?.suffix ?? "")
			.trim()
			.toLowerCase()
			.replace(/^\./, "");
		if (suffix.length < 1)
			throw new Error(`Invalid tld suffix in ${path}: ${JSON.stringify(tld)}`);
		if (tld.checkers === undefined) return { suffix };
		return {
			suffix,
			checkers: normalizeCheckers(`'${suffix}' in ${path}`, tld.checkers),
		};
	});
};

const normalizeNames = (names: RawInput["names"]) =>
	(names ?? [])
		.map((name) => String(name).trim().toLowerCase())
		.filter((name) => name.length > 0);

/** Newer input replace older configs, tlds (by suffix) and names are merged without duplicates */
const merge = (older: MergedInput, newer: MergedInput): MergedInput => {
	const tlds = new Map(older.tlds.map((tld) => [tld.suffix, tld]));
	for (const tld of newer.tlds) tlds.set(tld.suffix, tld);
	return {
		configs: { ...older.configs, ...newer.configs },
		tlds: [...tlds.values()],
		names: [...new Set([...older.names, ...newer.names])],
	};
};

export const loadInput = toActionCallback(
	async (dir: string, entry: string, progress: Progress) => {
		const cache = new Map<string, MergedInput>();
		const resolve = async (
			path: string,
			stack: string[],
		): Promise<MergedInput> => {
			if (stack.includes(path))
				throw new Error(
					`Circular extends detected: ${[...stack, path].join(" -> ")}`,
				);
			const cached = cache.get(path);
			if (cached) return cached;

			const raw = await progress.execStep(readFile, path);
			let base = EMPTY_INPUT;
			for (const ext of raw.extends ?? []) {
				base = merge(base, await resolve(toPath(dir, ext), [...stack, path]));
			}

			const result = merge(base, {
				configs: normalizeConfigs(path, raw.configs),
				tlds: normalizeTlds(path, raw.tlds),
				names: normalizeNames(raw.names),
			});
			cache.set(path, result);
			return result;
		};

		const merged = await resolve(toPath(dir, entry), []);
		const configs: Configs = { ...DEFAULT_CONFIGS, ...merged.configs };
		return success<Input>({
			configs,
			tlds: merged.tlds.map(
				(tld): Tld => ({
					suffix: tld.suffix,
					checkers: tld.checkers ?? configs.checkers,
				}),
			),
			names: merged.names,
		});
	},
	{
		getName: () => "loadInput",
		getStartMsg: (dir, entry) => `Loading... ${toPath(dir, entry)}`,
		getStopMsg: (r) =>
			`Resolved ${r?.tlds.length ?? 0} tld(s) and ${r?.names.length ?? 0} name(s)`,
	},
);
