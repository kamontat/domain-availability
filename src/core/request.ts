import type { DataInputValue } from "../models/input";
import type { DataRequest, DataRequestValue } from "../models/request";

import { getAvailabilityHeaders, getAvailabilityUrl } from "../apis";
import { DataStatus } from "../models/data";
import { toActionCallback } from "../models/progress-action";
import { chunks } from "../utils/array";

export const buildRequest = toActionCallback(async (input: DataInputValue[], chunkSize: number) => {
  const value = input.flatMap(i => {
    return chunks(i.names, chunkSize).map(names => {
      const tld = i.tld
      const url = getAvailabilityUrl(i.tld, names)
      const headers = getAvailabilityHeaders()
      return { tld, names, url, headers } as DataRequestValue
    })
  })

  return {
    status: DataStatus.SUCCESS,
    value,
  } as DataRequest
}, {
  getName: () => "buildRequest",
  getSettings: () => ({ retry: 0 }),
  getStopMsg: (result) => `Built ${result?.length ?? 0} requests`
})
