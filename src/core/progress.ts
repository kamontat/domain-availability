import type { ChalkInstance } from "chalk";
import type { Data, DataValue } from "#types/data";
import { DataStatus } from "#types/data";
import type { ActionCallback } from "#types/progress-action";
import type {
	StepCallback,
	StepOptions,
	StepSetting,
} from "#types/progress-step";
import { errorColor, getColor, timeDiffColor, warnColor } from "#utils/color";
import { print } from "#utils/console";
import { timeDiff, timeNow } from "#utils/time";

interface Action {
	name: string;
	steps: Step[];
	color: ChalkInstance;
	startTime: Date;
	diff?: number;
}

interface Step {
	index: number;
	name: string;
	color: ChalkInstance;
	startTime: Date;
	diff?: number;
}

interface Result {
	message?: string | undefined;
	warn?: Error | undefined;
	error?: Error | undefined;
}

/** Default step retry count */
const RETRY = 3;
/** Exponential backoff factor between retries */
const BACKOFF_FACTOR = 1.5;
const BACKOFF_BASE_MS = 200;
const BACKOFF_MAX_MS = 10_000;

export class Progress<C> {
	private startTime: Date;
	private currentAction: Action | undefined;
	private actions: Map<string, Action>;
	private steps: Map<string, Step>;
	private context: C;

	constructor(context: C) {
		this.startTime = timeNow();
		this.actions = new Map();
		this.steps = new Map();
		this.context = context;
	}

	/** Replace context passed to following actions */
	setContext(context: C) {
		this.context = context;
	}

	async execAction<ARGS extends unknown[], D extends Data<unknown>>(
		callback: ActionCallback<C, ARGS, D>,
		...args: ARGS
	): Promise<DataValue<D>> {
		const name = callback.getName(...args);
		const retry = callback.getSettings?.().retry ?? 0;
		this.startAction(name, callback.getStartMsg?.(...args));
		let lastError: Error | undefined;
		for (let count = 0; count < retry + 1; count++) {
			try {
				const result = await callback(this, this.context, ...args);
				switch (result.status) {
					case DataStatus.SUCCESS:
						this.stopAction(name, {
							message: callback.getStopMsg?.(result.value as DataValue<D>),
						});
						return result.value as DataValue<D>;

					case DataStatus.WARN:
						if (callback.needRetry?.(result, undefined)) {
							lastError = result.warn;
							await this.retryAction(name, count, retry, result.warn);
							continue;
						}
						this.stopAction(name, { warn: result.warn });
						return undefined as DataValue<D>;

					case DataStatus.ERROR:
						if (callback.needRetry?.(result, undefined)) {
							lastError = result.error;
							await this.retryAction(name, count, retry, result.error);
							continue;
						}
						this.stopAction(name, { error: result.error });
						return undefined as DataValue<D>;

					default:
						throw new Error(
							`Cannot identify the result status: ${JSON.stringify(result)}`,
						);
				}
			} catch (error) {
				if (callback.needRetry?.(undefined, error as Error)) {
					lastError = error as Error;
					await this.retryAction(name, count, retry, error as Error);
					continue;
				}

				this.stopAction(name, { error: error as Error });
				throw error;
			}
		}

		const error = new Error(
			`Retry count have been exceeded ${retry}: ${lastError?.message ?? "unknown error"}`,
		);
		this.stopAction(name, { error });
		throw error;
	}

	async execStep<ARGS extends unknown[], D>(
		callback: StepCallback<ARGS, D>,
		...args: ARGS
	) {
		return this.execStepWith({}, callback, ...args);
	}

	/** Same as execStep, but options override callback settings */
	async execStepWith<ARGS extends unknown[], D>(
		options: StepOptions,
		callback: StepCallback<ARGS, D>,
		...args: ARGS
	) {
		const name = callback.getName(...args);
		const { silent, onRetry, ...settings } = options;
		const { retry = RETRY, ...backoff } = {
			...callback.getSettings?.(),
			...settings,
		};
		const retryStep = async (count: number, error?: Error) => {
			if (count >= retry) return;
			onRetry?.(error);
			if (silent) await Bun.sleep(this.backOffTime(count, backoff));
			else await this.retryStep(name, count, retry, error, backoff);
		};
		const stopStep = (result: Result) => {
			if (!silent) this.stopStep(name, result);
		};
		if (!silent) this.startStep(name, callback.getStartMsg?.(...args));
		let lastError: Error | undefined;
		for (let count = 0; count < retry + 1; count++) {
			try {
				const result = await callback(...args);
				const [needRetry, retryErr] =
					callback.needRetry?.(result, undefined) ?? [];
				if (needRetry) {
					lastError = retryErr;
					await retryStep(count, retryErr);
					continue;
				}

				stopStep({ message: callback.getStopMsg?.(result, undefined) });
				return result;
			} catch (error) {
				const [needRetry, retryErr] =
					callback.needRetry?.(undefined, error as Error) ?? [];
				if (needRetry) {
					lastError = retryErr ?? (error as Error);
					await retryStep(count, lastError);
					continue;
				}

				stopStep({ error: error as Error });
				throw error;
			}
		}

		const error = new Error(
			`Retry count have been exceeded ${retry}: ${lastError?.message ?? "unknown error"}`,
		);
		stopStep({ error });
		throw error;
	}

	startAction(name: string, message?: string) {
		const action = this.newAction({ name });
		print(">>> %s | %s\n", action.color(action.name), message ?? "Starting...");
		return action;
	}

	async retryAction(name: string, count: number, retry: number, error: Error) {
		const action = this.getAction({ name });
		if (count >= retry) return;

		const sleep = this.backOffTime(count);
		const template = " -- %s | %s, retrying in %s (%d/%d)\n";
		print(
			template,
			action.color(action.name),
			error.message,
			timeDiffColor(sleep, false),
			count + 1,
			retry,
		);
		await Bun.sleep(sleep);
	}

	stopAction(name: string, result?: Result) {
		const action = this.getAction({ name });
		action.diff = timeDiff(action.startTime);
		print(
			"<<< %s | %s  %s\n",
			action.color(action.name),
			this.resultMsg(result),
			timeDiffColor(action.diff),
		);
	}

	startStep(name: string, message?: string) {
		const step = this.newStep({ name });
		print("    |-> %s | %s\n", step.color(step.name), message ?? "Starting...");
		return step;
	}

	async retryStep(
		name: string,
		count: number,
		retry: number,
		error?: Error,
		backoff?: Omit<StepSetting, "retry">,
	) {
		const step = this.getStep({ name });
		if (count >= retry) return;

		const sleep = this.backOffTime(count, backoff);
		const template = "      - %s | %s, retrying in %s (%d/%d)  %s\n";
		const _name = step.color(step.name);
		const _diff = timeDiffColor(timeDiff(step.startTime));
		const _msg = error?.message ?? "something went wrong";
		print(
			template,
			_name,
			_msg,
			timeDiffColor(sleep, false),
			count + 1,
			retry,
			_diff,
		);
		await Bun.sleep(sleep);
	}

	stopStep(name: string, result?: Result) {
		const step = this.getStep({ name });
		step.diff = timeDiff(step.startTime);
		print(
			"    <-| %s | %s  %s\n",
			step.color(step.name),
			this.resultMsg(result),
			timeDiffColor(step.diff),
		);
	}

	/** Print warning under current action */
	warn(message: string) {
		print("    !!! %s\n", warnColor(`Warn: ${message}`));
	}

	stop() {
		const diff = timeDiff(this.startTime);
		print("---------------------------------\n");
		print(`Total run time: ${timeDiffColor(diff)}\n`);
	}

	private resultMsg(result?: Result) {
		if (result?.message) return result.message;
		if (result?.warn) return warnColor(`Warn: ${result.warn.message}`);
		if (result?.error) return errorColor(`Error: ${result.error.message}`);
		return "Stopped successfully";
	}

	private newAction(action: Pick<Action, "name">) {
		this.currentAction = {
			name: action.name,
			color: getColor(action.name),
			startTime: timeNow(),
			steps: [],
		};
		this.actions.set(action.name, this.currentAction);
		return this.currentAction;
	}

	private newStep(step: Pick<Step, "name">) {
		if (!this.currentAction)
			throw new Error(
				"Cannot create new step when no current action performed",
			);
		const newStep: Step = {
			index: this.currentAction.steps.length,
			name: step.name,
			color: getColor(step.name),
			startTime: timeNow(),
		};
		this.currentAction.steps.push(newStep);
		this.steps.set(newStep.name, newStep);
		return newStep;
	}

	private getAction(action: Pick<Action, "name">) {
		const found = this.actions.get(action.name);
		if (!found)
			throw new Error(`Cannot get non-existed action: ${action.name}`);
		return found;
	}

	private getStep(step: Pick<Step, "name">) {
		const found = this.steps.get(step.name);
		if (!found) throw new Error(`Cannot get non-existed step: ${step.name}`);
		return found;
	}

	private backOffTime(count: number, backoff?: Omit<StepSetting, "retry">) {
		const base = backoff?.backoffInit ?? BACKOFF_BASE_MS;
		const factor = backoff?.backoffFactor ?? BACKOFF_FACTOR;
		const max = backoff?.backoffMax ?? BACKOFF_MAX_MS;
		return Math.min(Math.ceil(base * factor ** count), max);
	}
}
