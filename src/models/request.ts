import type { Data } from "./data";

export interface DataRequestValue {
  tld: string
  names: string[]
  url: URL
  headers: Headers
}

export type DataRequest = Data<Array<DataRequestValue>>
