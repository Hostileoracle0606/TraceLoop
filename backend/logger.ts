import pino, { type Logger, type Bindings } from 'pino';
import { getLogConfig } from './config';

function buildLogger(bindings?: Bindings): Logger {
  const { level } = getLogConfig();
  const isProduction = process.env.NODE_ENV === 'production';

  const options: pino.LoggerOptions = {
    level,
    ...(bindings ?? {}),
  };

  if (!isProduction) {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    };
  }

  return pino(options);
}

/** Root logger instance. */
export const logger: Logger = buildLogger();

/**
 * Create a child logger with additional bindings.
 * Useful for contextual logging, e.g. `createChildLogger({ taskId, userId })`.
 */
export function createChildLogger(bindings: Bindings): Logger {
  return logger.child(bindings);
}
