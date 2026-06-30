import { Request, Response, NextFunction } from 'express'

type LogFn = (line: string) => void

const defaultLog: LogFn = (line) => {
  if (process.env.NODE_ENV !== 'test') console.log(line)
}

/**
 * OPS-5: structured request logging. Logs method, path, status and duration
 * once the response finishes. The log function is injectable for testing /
 * shipping to a real log aggregator.
 */
export function requestLogger(log: LogFn = defaultLog) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    res.on('finish', () => {
      log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`)
    })
    next()
  }
}
