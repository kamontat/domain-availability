export interface StepSetting {
  retry: number
}

export interface StepCallbackProperty<ARGS extends any[], D> {
  getName: (...args: ARGS) => string
  getSettings: () => StepSetting

  getStartMsg?: (...args: ARGS) => string | undefined
  getStopMsg?: (result: D | undefined, error: Error | undefined) => string | undefined
  needRetry?: (result: D | undefined, error: Error | undefined) => [boolean, Error | undefined]
}

export interface StepCallbackFunction<ARGS extends any[], D> {
  (...args: ARGS): Promise<D>
}

export type StepCallback<ARGS extends any[], D> = StepCallbackFunction<ARGS, D> & StepCallbackProperty<ARGS, D>

export const toStepCallback = <ARGS extends any[], D>(
  fn: StepCallbackFunction<ARGS, D>,
  properties: StepCallbackProperty<ARGS, D>
) => {
  Object.assign(fn, properties)
  return fn as StepCallback<ARGS, D>
}
