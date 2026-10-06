import { join } from "node:path";
import type { Progress } from "#core";
import { success, warn } from "#types/data";
import type { InputConfig } from "#types/input";
import { toActionCallback } from "#types/progress-action";
import { print } from "#utils/console";
import type { CheckResult } from "./check";

/** Format date as YYYY-MM-DD in local timezone */
const toDateString = (date: Date) => {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
};

const countDomains = (groups: Record<string, unknown[]>) =>
	Object.values(groups).flat().length;

/** Output path of tld suffix (e.g. 'in.th' => '<dir>/YYYY-MM-DD/<prefix>-in-th.txt') */
const toOutputPath = (
	dir: string,
	date: Date,
	prefix: string,
	suffix: string,
) =>
	join(dir, toDateString(date), `${prefix}-${suffix.replaceAll(".", "-")}.txt`);

/** Output lines grouped by tld suffix, sorted and without empty group */
const toEntries = <T>(
	groups: Record<string, T[]>,
	toLine: (item: T) => string,
) =>
	Object.entries(groups)
		.filter(([, items]) => items.length > 0)
		.map(([suffix, items]) => [suffix, items.map(toLine).sort()] as const);

type OutputPrefix = "available" | "registered";
const OUTPUT_PREFIXES: OutputPrefix[] = ["available", "registered"];

/** Domain of output line (e.g. 'a.com rdap' => 'a.com') */
const toLineDomain = (line: string) => line.split(" ")[0] ?? line;

const readLines = async (path: string) => {
	const file = Bun.file(path);
	if (!(await file.exists())) return [];
	return (await file.text()).split("\n").filter((line) => line.length > 0);
};

/**
 * Merge new lines of tld suffix into existing output files of same day;
 * latest result of domain wins, so domain moves between available and registered.
 * Return number of written files.
 */
const mergeOutput = async (
	paths: Record<OutputPrefix, string>,
	lines: Record<OutputPrefix, string[]>,
) => {
	const merged = new Map<string, [OutputPrefix, string]>();
	for (const prefix of OUTPUT_PREFIXES) {
		for (const line of await readLines(paths[prefix]))
			merged.set(toLineDomain(line), [prefix, line]);
	}
	for (const prefix of OUTPUT_PREFIXES) {
		for (const line of lines[prefix])
			merged.set(toLineDomain(line), [prefix, line]);
	}

	let files = 0;
	for (const prefix of OUTPUT_PREFIXES) {
		const output = [...merged.values()]
			.filter(([p]) => p === prefix)
			.map(([, line]) => line)
			.sort();
		const file = Bun.file(paths[prefix]);
		if (output.length > 0) {
			await Bun.write(file, `${output.join("\n")}\n`);
			files++;
		} else if (await file.exists()) await file.delete();
	}
	return files;
};

export const writeOutput = toActionCallback(
	async (
		_progress: Progress<InputConfig>,
		configs: InputConfig,
		{ available, registered }: CheckResult,
		dir: string,
	) => {
		const total = countDomains(available) + countDomains(registered);
		if (total < 1) return warn(new Error("No checked domains to output"));

		const outputs = [
			["available", toEntries(available, (domain) => domain)],
			[
				"registered",
				toEntries(registered, ({ domain, reason }) => `${domain} ${reason}`),
			],
		] as const;

		const now = new Date();
		const suffixes = new Set(
			outputs.flatMap(([, entries]) => entries.map(([suffix]) => suffix)),
		);
		let files = 0;
		for (const suffix of suffixes) {
			const paths = {} as Record<OutputPrefix, string>;
			const lines = {} as Record<OutputPrefix, string[]>;
			for (const [prefix, entries] of outputs) {
				paths[prefix] = toOutputPath(dir, now, prefix, suffix);
				lines[prefix] = entries.find(([s]) => s === suffix)?.[1] ?? [];
			}
			files += await mergeOutput(paths, lines);
		}

		if (total <= configs.outputStdoutLimit) {
			for (const [prefix, entries] of outputs) {
				const lines = entries.flatMap(([, lines]) => lines);
				if (lines.length > 0) print("\n[%s]\n%s\n", prefix, lines.join("\n"));
			}
			print("\n");
		}
		return success({ dir: join(dir, toDateString(now)), files });
	},
	{
		getName: () => "writeOutput",
		getStartMsg: ({ available, registered }) =>
			`Writing... ${countDomains(available)} available and ${countDomains(registered)} registered domain(s)`,
		getStopMsg: (r) => `Written ${r?.files ?? 0} files to ${r?.dir}/*.txt`,
	},
);
