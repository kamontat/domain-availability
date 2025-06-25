import { DataStatus } from "../models/data"
import { toStepCallback } from "../models/progress-step"
import type { RawApiResponse } from "../models/response"

export const getAvailabilityHeaders = () => {
  const headers = new Headers()
  return headers
}

export const getAvailabilityUrl = (tld: string, names: string[]) => {
  const url = new URL("/api/domains/available", "https://services.pathosting.co.th")
  url.searchParams.set("preset", "pat")
  url.searchParams.set("enable_aftermarket", "0")
  url.searchParams.set("tld[]", tld)
  names.forEach(name => url.searchParams.append("domain_name[]", name))
  return url
}

export const getAvailability = toStepCallback(async (_: number, url: URL, headers: Headers) => {
  const request = new Request({
    method: "GET",
    url: url.toString(),
    headers,
  })

  const response = await fetch(request)
  if (!response.ok) throw new Error(`Response status is not ok: ${response.status} (${response.statusText})`)

  try {
    return await response.json() as Promise<RawApiResponse>
  } catch (error) {
    const body = await response.text()
    throw new Error(`${(error as Error).message}: ${body}`)
  }
}, {
  getName: (i: number) => `getAvailability(${i})`,
  getSettings: () => ({ retry: 8 }),
  getStartMsg: (_, url) => `Fetching... domains=[${url.searchParams.getAll("domain_name[]")}]`,
  needRetry: (result, error) => {
    if (error !== undefined)
      return [true, error]
    if (result?.status !== DataStatus.SUCCESS)
      return [true, new Error(`Response status is not success: ${JSON.stringify(result)}`)]
    return [false, undefined]
  }
})
