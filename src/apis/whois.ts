import { connect } from "node:net";

import { toStepCallback } from "#types/progress-step";

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

/** Find registry WHOIS server of top-level label from IANA; resolved to undefined when not exist */
export const getWhoisServer = toStepCallback(
	async (tld: string, timeout: number) => {
		const response = await query(IANA_WHOIS, tld, timeout);
		return response.match(/^(?:refer|whois):\s*(\S+)/im)?.[1];
	},
	{
		getName: (tld) => `whoisServer(${tld})`,
		getStartMsg: (tld) => `Fetching... ${IANA_WHOIS} for .${tld}`,
		getStopMsg: (r) => (r ? `Found ${r}` : "No WHOIS server"),
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
