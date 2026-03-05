function formatZodError(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      res.status(400).json({ ok: false, message: "Invalid request data.", errors: formatZodError(result.error) });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query || {});
    if (!result.success) {
      res.status(400).json({ ok: false, message: "Invalid query data.", errors: formatZodError(result.error) });
      return;
    }
    req.query = result.data;
    next();
  };
}

export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params || {});
    if (!result.success) {
      res.status(400).json({ ok: false, message: "Invalid route parameters.", errors: formatZodError(result.error) });
      return;
    }
    req.params = result.data;
    next();
  };
}
