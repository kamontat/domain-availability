import type { Data, DataValue } from "./data";

export interface ActionSetting {
  retry: number
}

export interface ActionCallbackProperty<ARGS extends any[], D extends Data<any>> {
  getName: (...args: ARGS) => string
  getSettings: () => ActionSetting

  getStartMsg?: (...args: ARGS) => string | undefined
  getStopMsg?: (result: DataValue<D> | undefined) => string | undefined

  needSkip?: (...args: ARGS) => boolean
  needRetry?: (result: D | undefined, error: Error | undefined) => boolean
}

export interface ActionCallbackFunction<ARGS extends any[], D extends Data<any>> {
  (...args: ARGS): Promise<D>
}

export type ActionCallback<ARGS extends any[], D extends Data<any>> = ActionCallbackFunction<ARGS, D> & ActionCallbackProperty<ARGS, D>

export const toActionCallback = <ARGS extends any[], D extends Data<any>>(
  fn: ActionCallbackFunction<ARGS, D>,
  properties: ActionCallbackProperty<ARGS, D>
) => {
  Object.assign(fn, properties)
  return fn as ActionCallback<ARGS, D>
}
