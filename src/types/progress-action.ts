import type { Progress } from "#core";
import type { Data, DataValue } from "./data";

export interface ActionSetting {
	retry: number;
}

export interface ActionCallbackProperty<
	ARGS extends unknown[],
	D extends Data<unknown>,
> {
	getName: (...args: ARGS) => string;
	getSettings?: () => ActionSetting;

	getStartMsg?: (...args: ARGS) => string | undefined;
	getStopMsg?: (result: DataValue<D> | undefined) => string | undefined;

	needRetry?: (result: D | undefined, error: Error | undefined) => boolean;
}

/** Action receive progress and its context first, then the input arguments */
export type ActionCallbackFunction<
	C,
	ARGS extends unknown[],
	D extends Data<unknown>,
> = (progress: Progress<C>, context: C, ...args: ARGS) => Promise<D>;

export type ActionCallback<
	C,
	ARGS extends unknown[],
	D extends Data<unknown>,
> = ActionCallbackFunction<C, ARGS, D> & ActionCallbackProperty<ARGS, D>;

export const toActionCallback = <
	C,
	ARGS extends unknown[],
	D extends Data<unknown>,
>(
	fn: ActionCallbackFunction<C, ARGS, D>,
	properties: ActionCallbackProperty<ARGS, D>,
) => {
	Object.assign(fn, properties);
	return fn as ActionCallback<C, ARGS, D>;
};
