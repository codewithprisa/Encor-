import db from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { logLogin } from "../utils/loginLog.js";

/*
 * Cek password. Mendukung hash bcrypt dan akun lama yang masih plaintext.
 * Kalau plaintext cocok, password langsung di-upgrade jadi hash di database.
 */
async function cekPassword(passwordInput, akun) {
  const isHashed =
    typeof akun.password === "string" && akun.password.startsWith("$2");

  if (isHashed) {
    return bcrypt.compare(passwordInput, akun.password);
  }

  if (passwordInput !== akun.password) return false;

  try {
    const hash = await bcrypt.hash(passwordInput, 10);
    await db.execute("UPDATE users SET password = ? WHERE id = ?", [hash, akun.id]);
  } catch (err) {
    // gagal upgrade tidak boleh menggagalkan login
    console.error("Gagal meng-hash password lama:", err);
  }
  return true;
}

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password wajib diisi.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [users] = await db.execute(
      `SELECT id, name, email, password, role, status, profile_picture
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [cleanEmail]
    );

    if (users.length === 0) {
      await logLogin(cleanEmail, null, "failed");
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    const admin = users[0];

    if (admin.role !== "admin") {
      await logLogin(cleanEmail, admin.id, "failed");
      return res.status(403).json({
        success: false,
        message: "Akun ini bukan akun admin.",
      });
    }

    if (admin.status !== "active") {
      await logLogin(cleanEmail, admin.id, "failed");
      return res.status(403).json({
        success: false,
        message: "Akun admin tidak aktif.",
      });
    }

    const passwordCocok = await cekPassword(password, admin);

    if (!passwordCocok) {
      await logLogin(cleanEmail, admin.id, "failed");
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET belum dikonfigurasi.");
    }

    const token = jwt.sign(
      { id: admin.id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    await logLogin(cleanEmail, admin.id, "success");

    return res.status(200).json({
      success: true,
      message: "Login admin berhasil.",
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        profile_picture: admin.profile_picture,
      },
    });
  } catch (error) {
    console.error("Login admin error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password wajib diisi.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [users] = await db.execute(
      `SELECT id, name, email, password, role, status, profile_picture
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [cleanEmail]
    );

    if (users.length === 0) {
      await logLogin(cleanEmail, null, "failed");
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    const user = users[0];

    if (user.status !== "active") {
      await logLogin(cleanEmail, user.id, "failed");
      return res.status(403).json({
        success: false,
        message: "Akun tidak aktif.",
      });
    }

    const passwordCocok = await cekPassword(password, user);

    if (!passwordCocok) {
      await logLogin(cleanEmail, user.id, "failed");
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET belum dikonfigurasi.");
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await logLogin(cleanEmail, user.id, "success");

    return res.status(200).json({
      success: true,
      message: "Login berhasil.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profile_picture: user.profile_picture,
      },
    });
  } catch (error) {
    console.error("Login user error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

export const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name?.trim() || !email?.trim() || !phone || !password) {
      return res.status(400).json({ message: "Semua data wajib diisi." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Kata sandi minimal 6 karakter." });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [exist] = await db.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [cleanEmail]
    );
    if (exist.length > 0) {
      return res.status(409).json({ message: "Email sudah terdaftar." });
    }

    const hashed = await bcrypt.hash(password, 10);

    // Pastikan nama kolom "phone" sama dengan tabelmu (lihat DESCRIBE users;)
    await db.execute(
      `INSERT INTO users (name, email, phone, password, role, status)
       VALUES (?, ?, ?, ?, 'user', 'active')`,
      [name.trim(), cleanEmail, phone, hashed]
    );

    return res.status(201).json({ message: "Pendaftaran berhasil." });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};