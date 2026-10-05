import { success, warn } from "#types/data";
import type { DomainGroup } from "#types/domain";
import type { Input } from "#types/input";
import { toActionCallback } from "#types/progress-action";

export const buildDomains = toActionCallback(
	async (input: Input) => {
		if (input.tlds.length < 1) return warn(new Error("No tlds were found"));
		if (input.names.length < 1) return warn(new Error("No names were found"));
		return success<DomainGroup[]>(
			input.tlds.map((tld) => ({ tld, names: input.names })),
		);
	},
	{
		getName: () => "buildDomains",
		getStopMsg: (r) => {
			const total = r?.reduce((sum, group) => sum + group.names.length, 0) ?? 0;
			return `Built ${total} domain(s) from ${r?.length ?? 0} tld(s)`;
		},
	},
);
