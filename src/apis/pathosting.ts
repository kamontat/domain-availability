import { toStepCallback } from "#types/progress-step";

import { retryUnlessSkip, SkipError } from "./errors";

enum PathostingAvailabilityStatus {
	REGISTERED = "registered",
	AVAILABLE = "available",
}

interface PathostingResponse {
	status: string;
	data?: {
		availability?: Record<string, { status: string } | undefined>;
	};
}

const getUrl = (name: string, suffix: string) => {
	const url = new URL(
		"/api/domains/available",
		"https://services.pathosting.co.th",
	);
	url.searchParams.set("preset", "pat");
	url.searchParams.set("enable_aftermarket", "0");
	url.searchParams.set("tld[]", suffix);
	url.searchParams.append("domain_name[]", name);
	return url;
};

/** Check domain availability using services.pathosting.co.th (Thai tlds); resolved to true when available */
export const checkPathosting = toStepCallback(
	async (name: string, suffix: string, timeout: number) => {
		const response = await fetch(getUrl(name, suffix), {
			signal: AbortSignal.timeout(timeout),
		});
		if (!response.ok)
			throw new Error(
				`Response status is not ok: ${response.status} (${response.statusText})`,
			);

		const body = await response.text();
		let json: PathostingResponse;
		try {
			json = JSON.parse(body) as PathostingResponse;
		} catch (error) {
			throw new Error(`${(error as Error).message}: ${body}`);
		}
		if (json.status !== "success")
			throw new Error(`Response status is not success: ${body}`);

		const domain = `${name}.${suffix}`;
		switch (json.data?.availability?.[domain]?.status) {
			case PathostingAvailabilityStatus.AVAILABLE:
				return true;
			case PathostingAvailabilityStatus.REGISTERED:
				return false;
			default:
				throw new SkipError(`Pathosting not support ${domain}: ${body}`);
		}
	},
	{
		getName: (name, suffix) => `pathosting(${name}.${suffix})`,
		getStopMsg: (r) => (r ? "Available" : "Registered"),
		needRetry: retryUnlessSkip,
	},
);
