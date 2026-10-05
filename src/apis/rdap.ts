import { toStepCallback } from "#types/progress-step";

import { retryUnlessSkip, SkipError } from "./errors";

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";

interface RdapBootstrap {
	/** List of [tlds, urls] */
	services: Array<[string[], string[]]>;
}

/** Map of tld to RDAP server base url */
export type RdapServers = Map<string, string>;

export const getRdapBootstrap = toStepCallback(
	async (timeout: number) => {
		const response = await fetch(BOOTSTRAP_URL, {
			signal: AbortSignal.timeout(timeout),
		});
		if (!response.ok)
			throw new Error(
				`Response status is not ok: ${response.status} (${response.statusText})`,
			);

		const json = (await response.json()) as RdapBootstrap;
		const servers: RdapServers = new Map();
		for (const [tlds, urls] of json.services) {
			const url = urls.find((u) => u.startsWith("https://")) ?? urls[0];
			if (!url) continue;
			for (const tld of tlds)
				servers.set(tld.toLowerCase(), url.endsWith("/") ? url : `${url}/`);
		}
		return servers;
	},
	{
		getName: () => "rdapBootstrap",
		getStartMsg: () => `Fetching... ${BOOTSTRAP_URL}`,
		getStopMsg: (r) => `Found ${r?.size ?? 0} tld(s) with RDAP server`,
		needRetry: retryUnlessSkip,
	},
);

/** Find RDAP server of suffix (e.g. 'co.uk' will fallback to 'uk') */
export const findRdapServer = (servers: RdapServers, suffix: string) => {
	const labels = suffix.split(".");
	for (let i = 0; i < labels.length; i++) {
		const server = servers.get(labels.slice(i).join("."));
		if (server) return server;
	}
	return undefined;
};

const BLOCKED_PATTERN = /blocked|reserved|restricted|prohibited|unavailable/i;

/**
 * Some registries answer 404 for domains that cannot be registered (e.g. "google.here blocked by BSA"),
 * so inspect error description before treating 404 as available.
 */
const isBlocked = async (response: Response) => {
	try {
		const json = (await response.json()) as { description?: string[] };
		return json.description?.some((d) => BLOCKED_PATTERN.test(d)) ?? false;
	} catch {
		return false;
	}
};

/** Check domain availability using RDAP; resolved to true when domain is not registered or blocked */
export const checkRdap = toStepCallback(
	async (domain: string, server: string, timeout: number) => {
		const url = new URL(`domain/${encodeURIComponent(domain)}`, server);
		const response = await fetch(url, {
			headers: { accept: "application/rdap+json" },
			signal: AbortSignal.timeout(timeout),
		});
		if (response.status === 404) return !(await isBlocked(response));
		if (response.ok) return false;
		if (
			response.status === 400 ||
			response.status === 403 ||
			response.status === 501
		)
			throw new SkipError(
				`RDAP server not support: ${response.status} (${response.statusText})`,
			);
		throw new Error(
			`Response status is not ok: ${response.status} (${response.statusText})`,
		);
	},
	{
		getName: (domain) => `rdap(${domain})`,
		getStopMsg: (r) => (r ? "Available" : "Registered"),
		needRetry: retryUnlessSkip,
	},
);
