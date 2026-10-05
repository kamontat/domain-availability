import { join } from "node:path";

import { success, warn } from "#types/data";
import { toActionCallback } from "#types/progress-action";
import { print } from "#utils/console";

/** Format date as YYYY-MM-DD in local timezone */
const toDateString = (date: Date) => {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
};

const countDomains = (available: Record<string, string[]>) =>
	Object.values(available).flat().length;

/** Output path of tld suffix (e.g. 'in.th' => '<dir>/YYYY-MM-DD/output-in-th.txt') */
const toOutputPath = (dir: string, date: Date, suffix: string) =>
	join(dir, toDateString(date), `output-${suffix.replaceAll(".", "-")}.txt`);

export const writeOutput = toActionCallback(
	async (available: Record<string, string[]>, dir: string, limit: number) => {
		const total = countDomains(available);
		if (total < 1) return warn(new Error("No available domains to output"));

		const entries = Object.entries(available)
			.filter(([, domains]) => domains.length > 0)
			.map(([suffix, domains]) => [suffix, [...domains].sort()] as const);

		if (total <= limit) {
			print("\n%s\n\n", entries.flatMap(([, domains]) => domains).join("\n"));
			return success(["STDOUT"]);
		}

		const now = new Date();
		const paths: string[] = [];
		for (const [suffix, domains] of entries) {
			const path = toOutputPath(dir, now, suffix);
			await Bun.write(path, `${domains.join("\n")}\n`);
			paths.push(path);
		}
		return success(paths);
	},
	{
		getName: () => "writeOutput",
		getStartMsg: (available, _, limit) => {
			const total = countDomains(available);
			return `Writing... ${total} domain(s) to ${total <= limit ? "STDOUT" : "file"}`;
		},
		getStopMsg: (r) => `Written to ${r?.join(", ")}`,
	},
);
