import type { InputTld } from "./input";

/** All domains of a single tld that need checking */
export interface DomainGroup {
	tld: InputTld;
	names: string[];
}

export const toDomain = (name: string, tld: InputTld) =>
	`${name}.${tld.suffix}`;
