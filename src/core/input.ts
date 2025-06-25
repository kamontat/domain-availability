import type { RawInput, DataInput, DataInputValue } from "../models/input";

import { parse } from "yaml";
import { DataStatus } from "../models/data";
import { toActionCallback } from "../models/progress-action";

export const readInputFile = toActionCallback(async (path: string, _?: DataInputValue[]) => {
  let content
  try {
    content = await Bun.file(path).text()
  } catch (error) {
    throw new Error(`Cannot read input file: ${error}`)
  }

  const raw = parse(content) as RawInput
  return {
    status: DataStatus.SUCCESS,
    value: Object.keys(raw).map(tld => ({ tld, names: raw[tld] ?? [] }))
  } as DataInput
}, {
  getName: () => "readInputFile",
  getSettings: () => ({ retry: 0 }),
  getStopMsg: (r) => `Read ${r?.length ?? 0} tld(s) with total ${r?.flatMap(r => r.names)?.length ?? 0} domains(s)`,
  needSkip: (_, input) => (input?.length ?? 0) > 0
})

export const readInputParam = toActionCallback(async () => {
  const names = Bun.argv.slice(2)
  if (names.length > 0) {
    return {
      status: DataStatus.SUCCESS,
      value: [{
        tld: "in.th",
        names,
      }]
    } as DataInput
  }
  else {
    return {
      status: DataStatus.WARN,
      warn: new Error("No input data were found")
    } as DataInput
  }
}, {
  getName: () => `readInputParam`,
  getSettings: () => ({ retry: 0 }),
  getStopMsg: r => `Read ${r?.[0]?.names?.length ?? 0} domain(s)`
})
