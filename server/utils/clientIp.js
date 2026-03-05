export function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = String(forwarded).split(",").map((s) => s.trim());
    return ips[0] || req.socket.remoteAddress || "0.0.0.0";
  }
  return req.socket.remoteAddress || "0.0.0.0";
}

export function getAnonymizedRequestIp(req) {
  const ip = getRequestIp(req);
  if (!ip || ip === "::1" || ip === "127.0.0.1") return "127.0.0.x";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  return ip.slice(0, 16) + "...";
}
