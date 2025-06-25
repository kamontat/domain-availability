import { getAvailability } from "../apis";
import { DataStatus } from "../models/data";
import { toActionCallback } from "../models/progress-action";
import type { DataRequestValue } from "../models/request";
import { RawApiResponseDataAvailabilityStatus, type DataResponse, type DataResponseValue } from "../models/response";
import type { Progress } from "./progress";

export const fetchData = toActionCallback(async (requests: DataRequestValue[], progress: Progress) => {
  const results: DataResponseValue = []
  let i = 0
  for (const { url, headers } of requests) {
    const { data } = await progress.execStep(getAvailability, i++, url, headers)
    const result = Object.keys(data.availability)
      .filter(domain => data.availability[domain]?.status === RawApiResponseDataAvailabilityStatus.AVAILABLE)
    results.push(...result)
  }

  return {
    status: DataStatus.SUCCESS,
    value: results
  } as DataResponse
}, {
  getName: () => `fetchData`,
  getSettings: () => ({ retry: 0 }),
  getStopMsg: r => `Found ${r?.length ?? 0} domains is available`
})
