import helmet from "helmet";

function isAssetPath(pathname) {
  return Boolean(pathname && /\.(css|js|map|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(pathname));
}

function getRouteGroup(pathname) {
  const path = String(pathname || "/");
  if (path.startsWith("/api/")) return "api";
  if (isAssetPath(path)) return "asset";
  return "app";
}

function baseDirectives({ allowWebSockets }) {
  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    frameAncestors: ["'self'"],
    frameSrc: [
      "'self'",
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com",
      "https://ad.a-ads.com"
    ],
    objectSrc: ["'none'"],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "https://cdn.jsdelivr.net", "data:"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://cdn.jsdelivr.net",
      "https://www.googletagmanager.com"
    ],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
    connectSrc: allowWebSockets
      ? ["'self'", "https:", "ws:", "wss:", "http://localhost:*", "ws://localhost:*"]
      : ["'self'", "https:"],
    upgradeInsecureRequests: []
  };
}

export function createCspMiddleware() {
  const appCsp = helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: baseDirectives({ allowWebSockets: true })
  });

  return (req, res, next) => {
    const group = getRouteGroup(req.path);
    if (group === "api") {
      next();
      return;
    }
    appCsp(req, res, next);
  };
}
