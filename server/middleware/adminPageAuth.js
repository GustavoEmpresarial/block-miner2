import { getAdminTokenFromRequest } from "../utils/token.js";
import jwt from "jsonwebtoken";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AdminPageAuth");

export function adminPageAuth(req, res, next) {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error("Admin page auth unavailable: JWT secret missing");
      res.redirect(302, "/admin/login");
      return;
    }

    const token = getAdminTokenFromRequest(req);

    if (!token) {
      res.redirect(302, "/admin/login");
      return;
    }

    let payload = null;
    try {
      payload = jwt.verify(token, jwtSecret, {
        issuer: "blockminer-admin",
        algorithms: ["HS256"]
      });
    } catch (err) {
      res.redirect(302, "/admin/login");
      return;
    }

    if (payload.role !== "admin" || payload.type !== "admin_session") {
      res.redirect(302, "/admin/login");
      return;
    }

    req.admin = { role: "admin" };
    next();
  } catch (error) {
    logger.error("Admin page auth error", { error: error.message });
    res.redirect(302, "/admin/login");
  }
}
