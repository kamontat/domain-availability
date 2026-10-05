import { connect } from "node:net";

import { toStepCallback } from "#types/progress-step";
import { chunks } from "#utils/array";

import { retryUnlessSkip, SkipError } from "./errors";

const IANA_WHOIS = "whois.iana.org";
const WHOIS_PORT = 43;

const AVAILABLE_PATTERN =
	/no match|not found|no data found|no entries found|no object found|status:\s*(free|available)|is available for registration/i;
const RATE_LIMIT_PATTERN =
	/limit exceeded|quota exceeded|too many (requests|queries)|try again later/i;
const REGISTERED_PATTERN =
	/domain name:|registrar:|creation date:|created:|registered on|domain status:|nserver:/i;

/** Send query to WHOIS server and read response until connection closed */
const query = (host: string, text: string, timeout: number) =>
	new Promise<string>((resolve, reject) => {
		const chunks: Buffer[] = [];
		const socket = connect({ host, port: WHOIS_PORT });
		socket.setTimeout(timeout, () =>
			socket.destroy(new Error(`WHOIS ${host} timed out after ${timeout}ms`)),
		);
		socket.on("connect", () => socket.write(`${text}\r\n`));
		socket.on("data", (chunk: Buffer) => chunks.push(chunk));
		socket.on("error", reject);
		socket.on("close", (hadError) => {
			if (!hadError) resolve(Buffer.concat(chunks).toString("utf8"));
		});
	});

/** Map of top-level label to registry WHOIS server; undefined when IANA has no WHOIS server */
export type WhoisServers = Map<string, string | undefined>;

/**
 * Find registry WHOIS server of each top-level label from IANA, queried in chunks.
 * Resolved labels are stored to `servers`, so retry only re-query the failed ones.
 */
export const getWhoisBootstrap = toStepCallback(
	async (
		tlds: string[],
		chunkSize: number,
		timeout: number,
		servers: WhoisServers = new Map(),
	) => {
		const errors: string[] = [];
		const pending = tlds.filter((tld) => !servers.has(tld));
		for (const batch of chunks(pending, chunkSize)) {
			await Promise.all(
				batch.map(async (tld) => {
					try {
						const response = await query(IANA_WHOIS, tld, timeout);
						servers.set(
							tld,
							response.match(/^(?:refer|whois):\s*(\S+)/im)?.[1],
						);
					} catch (error) {
						errors.push(`.${tld} (${(error as Error).message})`);
					}
				}),
			);
		}
		if (errors.length > 0)
			throw new Error(`Cannot fetch WHOIS server of ${errors.join(", ")}`);
		return servers;
	},
	{
		getName: () => "whoisBootstrap",
		getStartMsg: (tlds) =>
			`Fetching... ${IANA_WHOIS} for ${tlds.length} tld(s)`,
		getStopMsg: (r) =>
			`Found ${[...(r?.values() ?? [])].filter(Boolean).length} tld(s) with WHOIS server`,
		needRetry: retryUnlessSkip,
	},
);

/** Check domain availability using WHOIS; resolved to true when domain is not registered */
export const checkWhois = toStepCallback(
	async (domain: string, server: string, timeout: number) => {
		const response = await query(server, domain, timeout);
		if (AVAILABLE_PATTERN.test(response)) return true;
		if (REGISTERED_PATTERN.test(response)) return false;
		// checked last, legal notice of normal response may mention throttling
		if (RATE_LIMIT_PATTERN.test(response))
			throw new Error(`WHOIS ${server} rate limited`);
		throw new SkipError(`Cannot parse WHOIS response from ${server}`);
	},
	{
		getName: (domain) => `whois(${domain})`,
		getStopMsg: (r) => (r ? "Available" : "Registered"),
		needRetry: retryUnlessSkip,
	},
);
