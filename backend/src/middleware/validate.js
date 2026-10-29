const SOURCES = ['params', 'query', 'body'];

/**
 * Validates request parts against Zod schemas and stores the parsed (trimmed,
 * coerced, unknown-keys-stripped) values on `req.validated`. Express 5 makes
 * `req.query` read-only, so parsed values are not written back onto `req`.
 * A ZodError is forwarded to the error handler, which responds with 400.
 *
 *   router.get('/:id', validate({ params: uuidParamSchema }), controller.show)
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.validated = req.validated ?? {};
    for (const source of SOURCES) {
      if (schemas[source]) {
        req.validated[source] = schemas[source].parse(req[source] ?? {});
      }
    }
    next();
  };
}
