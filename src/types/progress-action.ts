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

	needSkip?: (...args: ARGS) => boolean;
	needRetry?: (result: D | undefined, error: Error | undefined) => boolean;
}

export type ActionCallbackFunction<
	ARGS extends unknown[],
	D extends Data<unknown>,
> = (...args: ARGS) => Promise<D>;

export type ActionCallback<
	ARGS extends unknown[],
	D extends Data<unknown>,
> = ActionCallbackFunction<ARGS, D> & ActionCallbackProperty<ARGS, D>;

export const toActionCallback = <
	ARGS extends unknown[],
	D extends Data<unknown>,
>(
	fn: ActionCallbackFunction<ARGS, D>,
	properties: ActionCallbackProperty<ARGS, D>,
) => {
	Object.assign(fn, properties);
	return fn as ActionCallback<ARGS, D>;
};
