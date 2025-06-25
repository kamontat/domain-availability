export const timeNow = () => new Date()

export const timeDiff = (start: Date) => Date.now() - start.getTime()
