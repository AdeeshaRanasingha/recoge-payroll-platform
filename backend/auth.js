import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Admin } from "./db.js";

export function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function handleLogin(req, res) {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = jwt.sign(
      { username: admin.username, company_id: admin.company_id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, username: admin.username, company_id: admin.company_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}