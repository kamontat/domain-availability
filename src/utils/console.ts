import { format } from 'node:util'

export const print = (formatter: string, ...params: any[]) => {
  process.stdout.write(format(formatter, ...params))
}
