export function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = String(forwarded).split(",").map((s) => s.trim());
    return ips[0] || req.socket.remoteAddress || "0.0.0.0";
  }
  return req.socket.remoteAddress || "0.0.0.0";
}

/** IP estável para gravar em DB (evita array/objeto do Express e strings gigantes). */
export function getClientIpForStorage(req) {
  const real = req.headers["x-real-ip"];
  if (real != null && real !== "") {
    const s = (Array.isArray(real) ? real[0] : String(real)).split(",")[0].trim();
    if (s) return s.slice(0, 128);
  }
  const fwd = req.headers["x-forwarded-for"];
  if (fwd != null && fwd !== "") {
    const s = (Array.isArray(fwd) ? fwd.join(",") : String(fwd)).split(",")[0].trim();
    if (s) return s.slice(0, 128);
  }
  const ip = req.ip || req.socket?.remoteAddress;
  if (ip != null && ip !== "") return String(ip).slice(0, 128);
  return getRequestIp(req).slice(0, 128);
}

export function getUserAgentForStorage(req) {
  const ua = req.headers["user-agent"];
  if (ua == null) return null;
  const s = Array.isArray(ua) ? ua.join(" ") : String(ua);
  const t = s.trim();
  if (!t) return null;
  return t.slice(0, 2000);
}

export function getAnonymizedRequestIp(req) {
  const ip = getRequestIp(req);
  if (!ip || ip === "::1" || ip === "127.0.0.1") return "127.0.0.x";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  return ip.slice(0, 16) + "...";
}
