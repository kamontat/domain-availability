import { basename, dirname, join } from "node:path";
import { parse } from "yaml";
import type { Progress } from "#core";
import { success } from "#types/data";
import type {
	Input,
	InputCheckerMap,
	InputConfig,
	InputTld,
	RawInput,
} from "#types/input";
import { Checker, DEFAULT_CHECKERS_KEY } from "#types/input";
import { toActionCallback } from "#types/progress-action";
import { toStepCallback } from "#types/progress-step";

export const DEFAULT_INPUT_CONFIG: InputConfig = {
	checkerChunk: 5,
	checkerTimeout: 5000,
	checkerRetries: 3,
	checkerBackoffInit: 200,
	checkerBackoffFactor: 1.5,
	checkerBackoffMax: 10_000,
	checkers: {
		[DEFAULT_CHECKERS_KEY]: [Checker.RDAP],
	},
};

/** Partially merged input, configs are not filled with defaults yet */
interface MergedInput {
	configs: Partial<InputConfig>;
	tlds: string[];
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

const normalizeSuffix = (path: string, tld: unknown) => {
	const suffix = (
		typeof tld === "string" || typeof tld === "number" ? String(tld) : ""
	)
		.trim()
		.toLowerCase()
		.replace(/^\./, "");
	if (suffix.length < 1)
		throw new Error(`Invalid tld suffix in ${path}: ${JSON.stringify(tld)}`);
	return suffix;
};

/** Validate number config; undefined when omitted */
const normalizeNumber = (
	path: string,
	key: string,
	value: unknown,
	{ min, integer = false }: { min: number; integer?: boolean },
) => {
	if (value === undefined) return undefined;
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < min ||
		(integer && !Number.isInteger(value))
	)
		throw new Error(
			`${key} of configs in ${path} must be ${integer ? "integer" : "number"} >= ${min}, got ${JSON.stringify(value)}`,
		);
	return value;
};

const normalizeConfigs = (
	path: string,
	configs: RawInput["configs"],
): Partial<InputConfig> => {
	const {
		checkers,
		checkerChunk,
		checkerTimeout,
		checkerRetries,
		checkerBackoffInit,
		checkerBackoffFactor,
		checkerBackoffMax,
	} = configs ?? {};
	const numbers = {
		checkerChunk: normalizeNumber(path, "checkerChunk", checkerChunk, {
			min: 1,
			integer: true,
		}),
		checkerTimeout: normalizeNumber(path, "checkerTimeout", checkerTimeout, {
			min: 1,
		}),
		checkerRetries: normalizeNumber(path, "checkerRetries", checkerRetries, {
			min: 0,
			integer: true,
		}),
		checkerBackoffInit: normalizeNumber(
			path,
			"checkerBackoffInit",
			checkerBackoffInit,
			{ min: 0 },
		),
		checkerBackoffFactor: normalizeNumber(
			path,
			"checkerBackoffFactor",
			checkerBackoffFactor,
			{ min: 1 },
		),
		checkerBackoffMax: normalizeNumber(
			path,
			"checkerBackoffMax",
			checkerBackoffMax,
			{ min: 0 },
		),
	};
	const rest = Object.fromEntries(
		Object.entries(numbers).filter(([, value]) => value !== undefined),
	) as Partial<InputConfig>;
	if (checkers === undefined) return rest;
	if (typeof checkers !== "object" || Array.isArray(checkers))
		throw new Error(
			`Checkers of configs in ${path} must be map of tld suffix (or '${DEFAULT_CHECKERS_KEY}') to checkers`,
		);
	const map: InputCheckerMap = {};
	for (const [key, value] of Object.entries(checkers)) {
		const suffix =
			key === DEFAULT_CHECKERS_KEY ? key : normalizeSuffix(path, key);
		map[suffix] = normalizeCheckers(`'${suffix}' in ${path}`, value);
	}
	return { ...rest, checkers: map };
};

const normalizeTlds = (path: string, tlds: RawInput["tlds"]) =>
	(tlds ?? []).map((tld) => normalizeSuffix(path, tld));

const normalizeNames = (names: RawInput["names"]) =>
	(names ?? [])
		.map((name) => String(name).trim().toLowerCase())
		.filter((name) => name.length > 0);

/** Find checkers of suffix (e.g. 'co.th' will fallback to 'th', then default) */
const findCheckers = (checkers: InputCheckerMap, suffix: string) => {
	const labels = suffix.split(".");
	for (let i = 0; i < labels.length; i++) {
		const found = checkers[labels.slice(i).join(".")];
		if (found) return found;
	}
	return checkers[DEFAULT_CHECKERS_KEY] ?? [];
};

/** Newer input replace older configs (checkers by suffix), tlds and names are merged without duplicates */
const merge = (older: MergedInput, newer: MergedInput): MergedInput => {
	const checkers =
		older.configs.checkers || newer.configs.checkers
			? { ...older.configs.checkers, ...newer.configs.checkers }
			: undefined;
	return {
		configs: {
			...older.configs,
			...newer.configs,
			...(checkers && { checkers }),
		},
		tlds: [...new Set([...older.tlds, ...newer.tlds])],
		names: [...new Set([...older.names, ...newer.names])],
	};
};

export const loadInput = toActionCallback(
	async (
		progress: Progress<InputConfig>,
		_configs: InputConfig,
		file: string,
	) => {
		const dir = dirname(file);
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

		const merged = await resolve(toPath(dir, basename(file)), []);
		const configs: InputConfig = {
			...DEFAULT_INPUT_CONFIG,
			...merged.configs,
			checkers: {
				...DEFAULT_INPUT_CONFIG.checkers,
				...merged.configs.checkers,
			},
		};
		return success<Input>({
			configs,
			tlds: merged.tlds.map(
				(suffix): InputTld => ({
					suffix,
					checkers: findCheckers(configs.checkers, suffix),
				}),
			),
			names: merged.names,
		});
	},
	{
		getName: () => "loadInput",
		getStartMsg: (file) => `Loading... ${file}`,
		getStopMsg: (r) =>
			`Resolved ${r?.tlds.length ?? 0} tld(s) and ${r?.names.length ?? 0} name(s)`,
	},
);
