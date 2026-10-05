/** Checker cannot give definite answer; not retried, fallback to next checker */
export class SkipError extends Error {}

/** Retry on any error except SkipError */
export const retryUnlessSkip = <D>(
	_: D | undefined,
	error: Error | undefined,
): [boolean, Error | undefined] => [
	error !== undefined && !(error instanceof SkipError),
	error,
];
