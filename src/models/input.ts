import type { Data } from "./data";

/** Data read from input yaml file */
export type RawInput = Record<string, string[]>

export interface DataInputValue {
  tld: string
  names: string[]
}

export type DataInput = Data<Array<DataInputValue>>
