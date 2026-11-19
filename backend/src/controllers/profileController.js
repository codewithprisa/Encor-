import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import db from "../config/db.js";
import { PROFILE_DIR } from "../middleware/profileMiddleware.js";

const MIN_NAME = 3;
const MAX_NAME = 50;
const MIN_PASSWORD = 8;

// Hash bcrypt selalu diawali $2a$, $2b$, atau $2y$
const isBcryptHash = (value) => typeof value === "string" && /^\$2[aby]\$/.test(value);

// GET /api/profil
export const getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, phone, role, photo, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    const u = rows[0];
    if (!u) {
      return res.status(404).json({ success: false, message: "Pengguna tidak ditemukan." });
    }

    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      photo: u.photo,
      joinedAt: u.created_at,
    });
  } catch (e) {
    console.error("getProfile:", e);
    res.status(500).json({ success: false, message: "Gagal memuat profil." });
  }
};

// PUT /api/profil
export const updateProfile = async (req, res) => {
  const name = String(req.body?.name ?? "").trim();

  if (name.length < MIN_NAME) {
    return res
      .status(400)
      .json({ success: false, message: `Nama lengkap minimal ${MIN_NAME} karakter.` });
  }
  if (name.length > MAX_NAME) {
    return res
      .status(400)
      .json({ success: false, message: `Nama lengkap maksimal ${MAX_NAME} karakter.` });
  }

  try {
    await db.query("UPDATE users SET name = ? WHERE id = ?", [name, req.user.id]);
    res.json({ success: true, name });
  } catch (e) {
    console.error("updateProfile:", e);
    res.status(500).json({ success: false, message: "Gagal menyimpan profil." });
  }
};

// PUT /api/profil/password
export const updatePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body ?? {};

  if (!oldPassword || !newPassword) {
    return res
      .status(400)
      .json({ success: false, message: "Kata sandi lama dan baru wajib diisi." });
  }
  if (String(newPassword).length < MIN_PASSWORD) {
    return res
      .status(400)
      .json({ success: false, message: `Kata sandi baru minimal ${MIN_PASSWORD} karakter.` });
  }
  if (oldPassword === newPassword) {
    return res.status(400).json({
      success: false,
      message: "Kata sandi baru harus berbeda dari kata sandi saat ini.",
    });
  }

  try {
    const [rows] = await db.query("SELECT password FROM users WHERE id = ?", [req.user.id]);
    const u = rows[0];
    if (!u) {
      return res.status(404).json({ success: false, message: "Pengguna tidak ditemukan." });
    }

    // SEMENTARA untuk debug: lihat bentuk data di database (jangan cetak password utuh)
    console.log(
      "PASSWORD DB:",
      typeof u.password,
      isBcryptHash(u.password) ? "bcrypt" : "BUKAN bcrypt",
      String(u.password ?? "").length
    );

    // Akun lama (data seed) mungkin menyimpan kata sandi polos. Bandingkan polos
    // untuk akun itu; setelah diganti, kata sandi baru selalu disimpan sebagai hash.
    const match = isBcryptHash(u.password)
      ? await bcrypt.compare(String(oldPassword), u.password)
      : String(oldPassword) === String(u.password);

    if (!match) {
      return res.status(400).json({ success: false, message: "Kata sandi saat ini salah." });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [hashed, req.user.id]);

    res.json({ success: true, message: "Kata sandi berhasil diubah." });
  } catch (e) {
    console.error("updatePassword:", e);
    res.status(500).json({ success: false, message: "Gagal mengubah kata sandi." });
  }
};

// PUT /api/profil/foto
export const updatePhoto = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "Foto tidak ditemukan." });
  }

  const photoPath = `/uploads/profile/${req.file.filename}`;

  try {
    const [rows] = await db.query("SELECT photo FROM users WHERE id = ?", [req.user.id]);
    const oldPhoto = rows[0]?.photo;

    await db.query("UPDATE users SET photo = ? WHERE id = ?", [photoPath, req.user.id]);

    // hapus foto lama dari folder profile
    if (oldPhoto && oldPhoto.startsWith("/uploads/profile/")) {
      fs.unlink(path.join(PROFILE_DIR, path.basename(oldPhoto)), () => {});
    }

    res.json({ success: true, photo: photoPath });
  } catch (e) {
    console.error("updatePhoto:", e);
    // gagal simpan ke DB → hapus file yang baru terunggah
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, message: "Gagal menyimpan foto." });
  }
};

// GET /api/profil/aktivitas
export const getActivity = async (req, res) => {
  try {
    // hanya admin yang boleh melihat riwayat login semua akun
    const [me] = await db.query("SELECT role FROM users WHERE id = ?", [req.user.id]);
    if (me[0]?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Akses ditolak." });
    }

    const [rows] = await db.query(
      `SELECT l.id, l.email, l.status, l.created_at, u.role
       FROM login_logs l
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC
       LIMIT 100`
    );

    res.json(
      rows.map((r) => ({
        id: String(r.id),
        email: r.email,
        at: r.created_at,
        failed: r.status === "failed",
        role: r.role ?? null,
      }))
    );
  } catch (e) {
    console.error("getActivity:", e);
    res.status(500).json({ success: false, message: "Gagal memuat aktivitas login." });
  }
};