import type { Data, DataStatus } from "./data";

export enum RawApiResponseDataAvailabilityStatus {
  REGISTERED = "registered",
  AVAILABLE = "available"
}

interface RawApiResponseDataAvailability {
  status: RawApiResponseDataAvailabilityStatus
}

interface RawApiResponseData {
  availability: Record<string, RawApiResponseDataAvailability>
}

export interface RawApiResponse {
  status: DataStatus
  data: RawApiResponseData
}

export type DataResponseValue = Array<string>

export type DataResponse = Data<DataResponseValue>
