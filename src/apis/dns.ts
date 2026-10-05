import { resolveNs } from "node:dns/promises";

import { toStepCallback } from "#types/progress-step";

import { retryUnlessSkip } from "./errors";

const withTimeout = <T>(promise: Promise<T>, timeout: number) =>
	Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error(`DNS timed out after ${timeout}ms`)),
				timeout,
			),
		),
	]);

/**
 * Check domain availability using DNS NS lookup; resolved to true when NXDOMAIN.
 * Unverified: registered domain without nameservers is also NXDOMAIN.
 */
export const checkDns = toStepCallback(
	async (domain: string, timeout: number) => {
		try {
			await withTimeout(resolveNs(domain), timeout);
			return false;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ENOTFOUND") return true;
			// name exist but no NS record
			if (code === "ENODATA") return false;
			throw error;
		}
	},
	{
		getName: (domain) => `dns(${domain})`,
		getStopMsg: (r) => (r ? "Available (unverified)" : "Registered"),
		needRetry: retryUnlessSkip,
	},
);
