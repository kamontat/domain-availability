import type { DataOutput } from "../models/output";
import type { DataResponseValue } from "../models/response";

import { DataStatus } from "../models/data";
import { toActionCallback } from "../models/progress-action";

export const openOutputFile = toActionCallback(async (path: string) => {
  const file = Bun.file(path)
  if (await file.exists()) await file.delete()
  return {
    status: DataStatus.SUCCESS,
    value: file.writer()
  } as DataOutput
}, {
  getName: () => "openOutputFile",
  getSettings: () => ({ retry: 0 }),
})

export const writeOutputFile = toActionCallback(async (writer: Bun.FileSink, response: DataResponseValue) => {
  response.forEach(r => {
    writer.write(r)
    writer.write('\n')
  })
  const bytes = await writer.end()

  return {
    status: DataStatus.SUCCESS,
    value: bytes
  }
}, {
  getName: () => "writeOutputFile",
  getSettings: () => ({ retry: 0 }),
  getStopMsg: (r) => `Written ${r} bytes to output`
})
