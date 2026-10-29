/**
 * Logs one line per request once the response finishes. Only the path is
 * logged — query strings can contain search terms (names, phone numbers).
 */
export function requestLogger(logger) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0];
      const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
      const level =
        res.statusCode >= 500 ? 'error' : path.startsWith('/api/health') ? 'debug' : 'info';
      logger[level](`${req.method} ${path} ${res.statusCode}`, { durationMs });
    });
    next();
  };
}
