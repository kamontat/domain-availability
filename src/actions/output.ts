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

		if (total <= configs.outputStdoutLimit) {
			for (const [prefix, entries] of outputs) {
				const lines = entries.flatMap(([, lines]) => lines);
				if (lines.length > 0) print("\n[%s]\n%s\n", prefix, lines.join("\n"));
			}
			print("\n");
			return success(["STDOUT"]);
		}

		const now = new Date();
		const paths: string[] = [];
		for (const [prefix, entries] of outputs) {
			for (const [suffix, lines] of entries) {
				const path = toOutputPath(dir, now, prefix, suffix);
				await Bun.write(path, `${lines.join("\n")}\n`);
				paths.push(path);
			}
		}
		return success(paths);
	},
	{
		getName: () => "writeOutput",
		getStartMsg: ({ available, registered }) =>
			`Writing... ${countDomains(available)} available and ${countDomains(registered)} registered domain(s)`,
		getStopMsg: (r) => `Written to ${r?.join(", ")}`,
	},
);
