export const chunks = <T>(arr: T[], n: number): T[][] => {
  return arr.reduce((output, item, i) => {
    const index = Math.floor(i / n)
    if (!output[index]) output[index] = []
    output[index].push(item)
    return output
  }, [] as T[][])
}
