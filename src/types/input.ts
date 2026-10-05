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

export interface InputTld {
	suffix: string;
	checkers: Checker[];
}

/** Key used for tlds without own checkers */
export const DEFAULT_CHECKERS_KEY = "_default";

/** Map of tld suffix (or `_default`) to checkers */
export type InputCheckerMap = Record<string, Checker[]>;

export interface InputConfig {
	/** Number of domains checked concurrently */
	checkerChunk: number;
	/** Timeout of each checker request in milliseconds */
	checkerTimeout: number;
	/** Number of retries for each checker request */
	checkerRetries: number;
	/** Backoff time before first checker retry in milliseconds */
	checkerBackoffInit: number;
	/** Multiplier of checker backoff time after each retry */
	checkerBackoffFactor: number;
	/** Maximum checker backoff time between retries in milliseconds */
	checkerBackoffMax: number;
	/** Checkers per tld suffix, tld without entry use parent suffix then `_default` */
	checkers: InputCheckerMap;
}

/** Data read from input yaml file (before extends resolved) */
export interface RawInput {
	extends?: string[];
	configs?: {
		checkerChunk?: unknown;
		checkerTimeout?: unknown;
		checkerRetries?: unknown;
		checkerBackoffInit?: unknown;
		checkerBackoffFactor?: unknown;
		checkerBackoffMax?: unknown;
		checkers?: Record<string, unknown>;
	};
	tlds?: Array<string | number>;
	names?: Array<string | number>;
}

/** Input after extends resolved */
export interface Input {
	configs: InputConfig;
	tlds: InputTld[];
	names: string[];
}
