import { Progress } from './core/progress'
import { readInputParam, readInputFile } from './core/input'
import { openOutputFile, writeOutputFile } from './core/output'
import { buildRequest } from './core/request'
import { fetchData } from './core/fetch'

const CHUCK_SIZE = 5
const OUTPUT_SIZE = 15

const progress = new Progress()

const input = await progress.execAction(readInputParam)
const file = (await progress.execAction(readInputFile, "res/input-all.yaml", input))!
const output = (await progress.execAction(openOutputFile, `res/output-${Date.now()}.txt`))!
const request = (await progress.execAction(buildRequest, input ?? file, CHUCK_SIZE))!
const response = (await progress.execAction(fetchData, request, progress))!
await progress.execAction(writeOutputFile, output, response, OUTPUT_SIZE)

progress.stop()
