import type { Tld } from "./input";

/** All domains of a single tld that need checking */
export interface DomainGroup {
	tld: Tld;
	names: string[];
}

export const toDomain = (name: string, tld: Tld) => `${name}.${tld.suffix}`;
