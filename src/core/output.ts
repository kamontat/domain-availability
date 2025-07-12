import type { DataOutput } from "../models/output";
import type { DataResponseValue } from "../models/response";

import { DataStatus } from "../models/data";
import { toActionCallback } from "../models/progress-action";
import { print } from "../utils/console";

export const openOutputFile = toActionCallback(async (path: string) => {
  const file = Bun.file(path)
  if (await file.exists()) await file.delete()
  return {
    status: DataStatus.SUCCESS,
    value: file
  } as DataOutput
}, {
  getName: () => "openOutputFile",
  getSettings: () => ({ retry: 0 }),
})

export const writeOutputFile = toActionCallback(async (file: Bun.BunFile, response: DataResponseValue) => {
  const writer = file.writer({ highWaterMark: 128 })

  if (response.length > 15) {
    response.forEach(async r => {
      writer.write(r)
      writer.write('\n')
    })
    const bytes = await writer.end()
    if (bytes < 1) await file.delete()
    return {
      status: DataStatus.SUCCESS,
      value: bytes
    }
  }

  await file.delete() // DO NOT use file to output
  print("\n%s\n\n", response.join('\n'))
  return {
    status: DataStatus.SUCCESS,
    value: -1
  }
}, {
  getName: () => "writeOutputFile",
  getSettings: () => ({ retry: 0 }),
  getStartMsg: (f, r) => r.length > 15 ? `Writing... ${f.name ?? 'unknown'}` : `Writing... STDOUT`,
  getStopMsg: (r) => (r ?? 0) > 0 ? `Written ${r} bytes to output` : `Finished write`
})
