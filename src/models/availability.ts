import type { Data } from "./data"
import type { RawApiResponseDataAvailabilityStatus } from "./response"

export interface DataAvailabilityValue<DOMAIN extends string> {
  domain: DOMAIN,
  status: RawApiResponseDataAvailabilityStatus
}

export type DataAvailability<DOMAIN extends string> = Data<DataAvailabilityValue<DOMAIN>>
