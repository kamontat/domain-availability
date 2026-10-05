/** Supported availability checker, tried in order until one gives definite answer */
export enum Checker {
	/** IANA RDAP bootstrap lookup, works with most gTLDs and many ccTLDs */
	RDAP = "rdap",
	/** IANA WHOIS referral then registry WHOIS (port 43), works with most ccTLDs */
	WHOIS = "whois",
	/** services.pathosting.co.th availability API, supports Thai tlds only (e.g. in.th) */
	PATHOSTING = "pathosting",
	/** DNS NS lookup; NXDOMAIN means likely unregistered (unverified) */
	DNS = "dns",
}

export interface Tld {
	suffix: string;
	checkers: Checker[];
}

export interface Configs {
	/** Default checkers of tld without checkers list */
	checkers: Checker[];
	/** Number of items to process in each chunk */
	chunkSize: number;
	/** Number of request retries */
	reqRetries: number;
	/** Retry backoff factor for request retries */
	reqRetryBackoff: number;
	/** Request timeout in milliseconds */
	reqTimeout: number;
	/** Only output to stdout up to the specified limit */
	stdoutLimit: number;
}

/** Data read from input yaml file (before extends resolved) */
export interface RawInput {
	extends?: string[];
	configs?: Partial<Configs>;
	tlds?: Array<{ suffix: string; checkers?: string[] }>;
	names?: Array<string | number>;
}

/** Input after extends resolved */
export interface Input {
	configs: Configs;
	tlds: Tld[];
	names: string[];
}
