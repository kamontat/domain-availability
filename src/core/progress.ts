import type { ChalkInstance } from "chalk"
import { DataStatus, type Data, type DataValue } from "../models/data"
import type { ActionCallback } from "../models/progress-action"
import type { StepCallback } from "../models/progress-step"

import { print } from "../utils/console"
import { timeDiff, timeNow } from "../utils/time"
import { errorColor, getColor, timeDiffColor, warnColor } from "../utils/color"

interface Action {
  name: string
  steps: Step[]
  color: ChalkInstance
  startTime: Date
  diff?: number
}

interface Step {
  index: number
  name: string
  color: ChalkInstance
  startTime: Date
  diff?: number
}

interface Result {
  message?: string
  warn?: Error
  error?: Error
}

export class Progress {
  private startTime: Date
  private currentAction: Action | undefined
  private actions: Map<string, Action>
  private steps: Map<string, Step>
  constructor() {
    this.startTime = timeNow()
    this.actions = new Map()
    this.steps = new Map()
  }

  start() {
    this.startTime = timeNow()
    this.actions = new Map()
    this.steps = new Map()
    this.currentAction = undefined
  }

  async execAction<ARGS extends any[], D extends Data<any>>(
    callback: ActionCallback<ARGS, D>,
    ...args: ARGS
  ): Promise<DataValue<D> | undefined> {
    const name = callback.getName(...args)
    const setting = callback.getSettings()
    if (callback.needSkip?.(...args)) {
      this.newAction({ name })
      this.skipAction(name)
      return undefined
    }

    this.startAction(name, callback.getStartMsg?.(...args))
    for (let count = 0; count < setting.retry + 1; count++) {
      try {
        const result = await callback(...args)
        switch (result.status) {
          case DataStatus.SUCCESS:
            this.stopAction(name, { message: callback.getStopMsg?.(result.value) })
            return result.value

          case DataStatus.WARN:
            if (callback.needRetry?.(result, undefined)) {
              this.retryAction(name, count, setting.retry, result.warn)
              continue
            }
            this.stopAction(name, { warn: result.warn })
            return undefined

          case DataStatus.ERROR:
            if (callback.needRetry?.(result, undefined)) {
              this.retryAction(name, count, setting.retry, result.error)
              continue
            }
            this.stopAction(name, { error: result.error })
            return undefined

          default:
            throw new Error(`Cannot identify the result status: ${JSON.stringify(result)}`)
        }
      } catch (error) {
        // continue new round
        if (callback.needRetry?.(undefined, error as Error)) {
          this.retryAction(name, count, setting.retry, error as Error)
          continue
        }

        this.stopAction(name, {
          error: error as Error
        })
        throw error
      }
    }

    const error = new Error("Retry count have been exceeded " + setting.retry)
    this.stopAction(name, {
      error
    })
    throw error
  }

  async execStep<ARGS extends any[], D>(
    callback: StepCallback<ARGS, D>,
    ...args: ARGS
  ) {
    const name = callback.getName(...args)
    const setting = callback.getSettings()
    this.startStep(name, callback.getStartMsg?.(...args))
    for (let count = 0; count < setting.retry + 1; count++) {
      try {
        const result = await callback(...args)
        const [retry, retryErr] = callback.needRetry?.(result, undefined) ?? []
        if (retry) {
          this.retryStep(name, count, setting.retry, retryErr)
          continue
        }

        this.stopStep(name, { message: callback.getStopMsg?.(result, undefined) })
        return result
      } catch (error) {
        // continue new round
        const [retry, retryErr] = callback.needRetry?.(undefined, error as Error) ?? []
        if (retry) {
          this.retryStep(name, count, setting.retry, retryErr ?? error as Error)
          continue
        }

        this.stopStep(name, {
          error: error as Error
        })
        throw error
      }
    }

    const error = new Error("Retry count have been exceeded " + setting.retry)
    this.stopStep(name, {
      error
    })
    throw error
  }

  startAction(name: string, message?: string) {
    const action = this.newAction({ name })
    const template = ">>> %s | %s\n"
    if (message)
      print(template, action.color(action.name), message)
    else
      print(template, action.color(action.name), "Starting...")
    return action
  }

  retryAction(name: string, count: number, retry: number, error: Error) {
    const action = this.getAction({ name })
    const sleep = this.backOffTime(count)

    if (count < retry) {
      const template = " -- %s | %s, retrying in %s (%d/%d)\n"
      const _name = action.color(action.name)
      print(template, _name, error.message, timeDiffColor(sleep, false), count, retry)
      Bun.sleepSync(sleep)
    }
  }

  skipAction(name: string) {
    const action = this.getAction({ name })
    action.diff = timeDiff(action.startTime)

    const template = "!!! %s | Skipped\n"
    const _name = action.color(action.name)
    print(template, _name)
  }

  stopAction(name: string, result?: Result) {
    const action = this.getAction({ name })
    action.diff = timeDiff(action.startTime)

    const template = "<<< %s | %s  %s\n"
    const _name = action.color(action.name)
    const _diff = timeDiffColor(action.diff!)
    if (result?.message)
      print(template, _name, result.message, _diff)
    else if (result?.warn)
      print(template, _name, warnColor(`Warn: ${result.warn.message}`), _diff)
    else if (result?.error)
      print(template, _name, errorColor(`Error: ${result.error.message}`), _diff)
    else
      print(template, _name, "Stopped successfully", _diff)
  }

  startStep(name: string, message?: string) {
    const step = this.newStep({ name })
    const template = "    |-> %s | %s\n"
    if (message)
      print(template, step.color(step.name), message)
    else
      print(template, step.color(step.name), "Starting...")
    return step
  }

  retryStep(name: string, count: number, retry: number, error?: Error) {
    const step = this.getStep({ name })
    const sleep = this.backOffTime(count)

    if (count < retry) {
      const template = "      - %s | %s, retrying in %s (%d/%d)  %s\n"
      const _name = step.color(step.name)
      const _diff = timeDiffColor(timeDiff(step.startTime))
      print(template, _name, error?.message ?? "something went wrong", timeDiffColor(sleep, false), count, retry, _diff)
      Bun.sleepSync(sleep)
    }
  }

  stopStep(name: string, result?: Result) {
    const step = this.getStep({ name })
    step.diff = timeDiff(step.startTime)

    const template = "    <-| %s | %s  %s\n"
    const _name = step.color(step.name)
    const _diff = timeDiffColor(step.diff!)
    if (result?.message)
      print(template, _name, result.message, _diff)
    else if (result?.warn)
      print(template, _name, warnColor(`Warn: ${result.warn.message}`), _diff)
    else if (result?.error)
      print(template, _name, errorColor(`Error: ${result.error.message}`), _diff)
    else
      print(template, _name, "Stopped successfully", _diff)
  }

  stop() {
    const diff = timeDiff(this.startTime)
    print("---------------------------------\n")
    print(`Total run time: ${timeDiffColor(diff)}\n`)
  }

  private newAction(action: Pick<Action, "name">) {
    this.currentAction = {
      name: action.name,
      color: getColor(action.name),
      startTime: timeNow(),
      steps: []
    }
    this.actions.set(action.name, this.currentAction)
    return this.currentAction
  }

  private newStep(step: Pick<Step, "name">) {
    if (!this.currentAction)
      throw new Error("Cannot create new step when no current action performed")
    const newStep: Step = {
      index: this.currentAction.steps.length,
      name: step.name,
      color: getColor(step.name),
      startTime: timeNow()
    }
    this.currentAction.steps.push(newStep)
    this.steps.set(newStep.name, newStep)
    return newStep
  }

  private getAction(action: Pick<Action, "name">) {
    if (!this.actions.has(action.name))
      throw new Error(`Cannot get non-existed action: ${action.name}`)
    return this.actions.get(action.name)!
  }

  private getStep(step: Pick<Step, "name">) {
    if (!this.steps.has(step.name))
      throw new Error(`Cannot get non-existed step: ${step.name}`)
    return this.steps.get(step.name)!
  }

  private backOffTime(count: number) {
    return Math.min(Math.ceil(200 * count * Math.max(Math.log(count), 1)), 5000)
  }
}
