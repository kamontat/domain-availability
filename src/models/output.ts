import type { FileSink } from "bun"
import type { Data } from "./data"

/** Data write to output txt file */
export type RawOutput = string[]

export type DataOutput = Data<FileSink>
