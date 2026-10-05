import type { RdapServers } from "#apis";
import {
	checkDns,
	checkPathosting,
	checkRdap,
	checkWhois,
	findRdapServer,
	getRdapBootstrap,
	getWhoisServer,
} from "#apis";
import { success } from "#types/data";
import type { DomainGroup } from "#types/domain";
import { toDomain } from "#types/domain";
import type { Configs, Tld } from "#types/input";
import { Checker } from "#types/input";
import { toActionCallback } from "#types/progress-action";
import { chunks } from "#utils/array";
import type { Progress } from "./progress";

export interface CheckResult {
	/** Domains that available to purchase, grouped by tld suffix */
	available: Record<string, string[]>;
	/** Domains that cannot be checked (no supported checker or all checkers failed) */
	failed: string[];
}

/** Check single domain; resolved to true when available */
type DomainCheck = (domain: string) => Promise<boolean>;

/** Shared lookups across tlds, so each server is resolved only once */
class Resolver {
	private rdapServers: RdapServers | undefined;
	private whoisServers = new Map<string, string | undefined>();

	constructor(
		private progress: Progress,
		private configs: Configs,
	) {}

	/** Build checks of tld in configured order, dropping checkers that not support the tld */
	async resolve(tld: Tld) {
		const timeout = this.configs.reqTimeout;
		const checks: DomainCheck[] = [];
		for (const checker of tld.checkers) {
			switch (checker) {
				case Checker.RDAP: {
					const server = await this.rdapServer(tld.suffix);
					if (server)
						checks.push((domain) =>
							this.progress.execStep(checkRdap, domain, server, timeout),
						);
					else
						this.progress.warn(
							`No RDAP server for .${tld.suffix}, skipped rdap checker`,
						);
					break;
				}
				case Checker.WHOIS: {
					const server = await this.whoisServer(tld.suffix);
					if (server)
						checks.push((domain) =>
							this.progress.execStep(checkWhois, domain, server, timeout),
						);
					else
						this.progress.warn(
							`No WHOIS server for .${tld.suffix}, skipped whois checker`,
						);
					break;
				}
				case Checker.PATHOSTING:
					checks.push((domain) =>
						this.progress.execStep(
							checkPathosting,
							domain.slice(0, -tld.suffix.length - 1),
							tld.suffix,
							timeout,
						),
					);
					break;
				case Checker.DNS:
					checks.push((domain) =>
						this.progress.execStep(checkDns, domain, timeout),
					);
					break;
			}
		}
		return checks;
	}

	private async rdapServer(suffix: string) {
		try {
			this.rdapServers ??= await this.progress.execStep(
				getRdapBootstrap,
				this.configs.reqTimeout,
			);
		} catch {
			return undefined;
		}
		return findRdapServer(this.rdapServers, suffix);
	}

	private async whoisServer(suffix: string) {
		const tld = suffix.split(".").at(-1) as string;
		if (!this.whoisServers.has(tld)) {
			try {
				this.whoisServers.set(
					tld,
					await this.progress.execStep(
						getWhoisServer,
						tld,
						this.configs.reqTimeout,
					),
				);
			} catch {
				this.whoisServers.set(tld, undefined);
			}
		}
		return this.whoisServers.get(tld);
	}
}

/** Try each check in order until one gives definite answer; resolved to undefined when all failed */
const fallback = async (checks: DomainCheck[], domain: string) => {
	for (const check of checks) {
		try {
			return await check(domain);
		} catch {
			// fallback to next checker
		}
	}
	return undefined;
};

export const checkAvailability = toActionCallback(
	async (groups: DomainGroup[], configs: Configs, progress: Progress) => {
		const result: CheckResult = { available: {}, failed: [] };
		const resolver = new Resolver(progress, configs);

		for (const { tld, names } of groups) {
			const available: string[] = [];
			result.available[tld.suffix] = available;

			const domains = names.map((name) => toDomain(name, tld));
			const checks = await resolver.resolve(tld);
			if (checks.length < 1) {
				progress.warn(
					`No checker available for .${tld.suffix}, skipped ${domains.length} domain(s)`,
				);
				result.failed.push(...domains);
				continue;
			}

			for (const batch of chunks(domains, configs.chunkSize)) {
				const answers = await Promise.all(
					batch.map((domain) => fallback(checks, domain)),
				);
				answers.forEach((answer, i) => {
					const domain = batch[i] as string;
					if (answer === undefined) result.failed.push(domain);
					else if (answer) available.push(domain);
				});
			}
		}

		return success(result);
	},
	{
		getName: () => "checkAvailability",
		getStartMsg: (groups) => {
			const total = groups.reduce((sum, group) => sum + group.names.length, 0);
			return `Checking... ${total} domain(s) from ${groups.length} tld(s)`;
		},
		getStopMsg: (r) => {
			const failed = r?.failed.length ? `, ${r.failed.length} failed` : "";
			const total = Object.values(r?.available ?? {}).flat().length;
			return `Found ${total} available domain(s)${failed}`;
		},
	},
);
