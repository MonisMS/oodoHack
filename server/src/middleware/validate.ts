import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
export function validate(schema: ZodType, source: 'body' | 'query' | 'params' = 'body'): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    // Express 5 query is a getter. Controllers use res.locals.validated[source].
    res.locals.validated ??= {}; res.locals.validated[source] = result.data; next();
  };
}
