import { randomInt } from 'node:crypto';
import chalk from 'chalk';
import pms from 'pretty-ms';

import { createRandom } from './random';

export const getColor = (input: string) => {
  const random = createRandom(input)
  return chalk.rgb(random(0, 255), random(0, 255), random(0, 255))
}

export const randomColor = () => {
  return chalk.rgb(randomInt(0, 255), randomInt(0, 255), randomInt(0, 255))
}

export const timeDiffColor = (ms: number, color = true) => {
  const _ms = '+' + pms(ms)
  if (!color) return _ms
  else if (ms > 1000) return chalk.red.bold(_ms)
  else if (ms > 500) return chalk.yellowBright.bold(_ms)
  else if (ms > 250) return chalk.yellow.bold(_ms)
  else if (ms > 100) return chalk.green(_ms)
  else if (ms > 50) return chalk.greenBright.bold(_ms)
  else if (ms > 10) return chalk.greenBright(_ms)
  else return chalk.gray.bold(_ms)
}

export const warnColor = (msg: string) => {
  return chalk.yellowBright(msg)
}

export const errorColor = (msg: string) => {
  return chalk.redBright(msg)
}
