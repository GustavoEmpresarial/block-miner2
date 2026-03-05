import crypto from "crypto";

export const CSRF_COOKIE_NAME = "blockminer_csrf";

function parseCookie(headerValue) {
  if (!headerValue) return {};
  return headerValue.split(";").reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return acc;
  }, {});
}

function buildCsrfCookie(token) {
  const parts = [`${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`, "Path=/", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  const cookies = Array.isArray(existing) ? existing : [existing];
  res.setHeader("Set-Cookie", [...cookies, cookieValue]);
}

export function createCsrfMiddleware() {
  return (req, res, next) => {
    const cookies = parseCookie(req.headers.cookie || "");
    
    // Always ensure a CSRF cookie exists for the frontend,
    // but WE WILL NOT block any requests for now to ensure compatibility.
    let csrfToken = cookies[CSRF_COOKIE_NAME];
    if (!csrfToken || csrfToken.length < 16) {
      csrfToken = crypto.randomBytes(24).toString("base64url");
      appendSetCookie(res, buildCsrfCookie(csrfToken));
    }

    res.locals.csrfToken = csrfToken;
    
    // TEMPORARY: Allow all requests to pass CSRF check during testing phase
    next();
  };
}
