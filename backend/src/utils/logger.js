const LEVELS = Object.freeze({ silent: -1, error: 0, warn: 1, info: 2, debug: 3 });

export const LOG_LEVELS = Object.freeze(Object.keys(LEVELS));

function serializeError(err, includeStack) {
  return {
    name: err.name,
    message: err.message,
    ...(err.code && { code: err.code }),
    ...(includeStack && err.stack && { stack: err.stack }),
  };
}

function serializeMeta(meta, includeStack) {
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = value instanceof Error ? serializeError(value, includeStack) : value;
  }
  return out;
}

/**
 * Minimal structured logger. `json` format writes one JSON object per line
 * (for Render's log collector); `pretty` is for local development.
 * Callers must never pass secrets (connection strings, tokens, passwords).
 */
export function createLogger({
  level = 'info',
  format = 'pretty',
  stream = process.stdout,
  errorStream = process.stderr,
} = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const includeStack = format !== 'json';

  function write(name, message, meta = {}) {
    if (LEVELS[name] > threshold) return;
    const time = new Date().toISOString();
    const fields = serializeMeta(meta, includeStack);
    const target = name === 'error' || name === 'warn' ? errorStream : stream;

    if (format === 'json') {
      target.write(`${JSON.stringify({ level: name, time, msg: message, ...fields })}\n`);
      return;
    }
    const extra = Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '';
    target.write(`${time} ${name.toUpperCase().padEnd(5)} ${message}${extra}\n`);
  }

  return {
    level,
    error: (message, meta) => write('error', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    info: (message, meta) => write('info', message, meta),
    debug: (message, meta) => write('debug', message, meta),
  };
}

export const silentLogger = createLogger({ level: 'silent' });
