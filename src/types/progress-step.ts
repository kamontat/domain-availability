export interface StepSetting {
	retry: number;
	/** Backoff time before first retry in milliseconds */
	backoffInit?: number;
	/** Multiplier of backoff time after each retry */
	backoffFactor?: number;
	/** Maximum backoff time between retries in milliseconds */
	backoffMax?: number;
}

/** Per-call options of step execution */
export interface StepOptions extends Partial<StepSetting> {
	/** Do not print start, retry and stop logs */
	silent?: boolean;
	/** Called before each retry */
	onRetry?: (error: Error | undefined) => void;
}

export interface StepCallbackProperty<ARGS extends unknown[], D> {
	getName: (...args: ARGS) => string;
	/** Default to progress request retry configs when omitted */
	getSettings?: () => StepSetting;

	getStartMsg?: (...args: ARGS) => string | undefined;
	getStopMsg?: (
		result: D | undefined,
		error: Error | undefined,
	) => string | undefined;
	needRetry?: (
		result: D | undefined,
		error: Error | undefined,
	) => [boolean, Error | undefined];
}

export type StepCallbackFunction<ARGS extends unknown[], D> = (
	...args: ARGS
) => Promise<D>;

export type StepCallback<ARGS extends unknown[], D> = StepCallbackFunction<
	ARGS,
	D
> &
	StepCallbackProperty<ARGS, D>;

export const toStepCallback = <ARGS extends unknown[], D>(
	fn: StepCallbackFunction<ARGS, D>,
	properties: StepCallbackProperty<ARGS, D>,
) => {
	Object.assign(fn, properties);
	return fn as StepCallback<ARGS, D>;
};
