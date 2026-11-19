import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/src/middleware -> backend/uploads/payment-user
const DIR = path.join(__dirname, "..", "..", "uploads", "payment-user");
fs.mkdirSync(DIR, { recursive: true });

const EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

/** "Icha Putri" -> "icha-putri" (aman dipakai sebagai nama file) */
const slug = (s) =>
  String(s || "user")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "user";

/**
 * Jalan SEBELUM multer:
 * - pastikan pesanan milik user yang login & masih pending
 * - ambil nama user untuk nama file
 * Jadi file milik pesanan orang lain tidak pernah tersimpan di disk.
 */
export async function siapkanStruk(req, res, next) {
  try {
    const userId = req.user?.id;
    const orderId = Number(req.params.orderId);

    if (!userId) return res.status(401).json({ message: "Silakan login dulu." });
    if (!orderId) return res.status(400).json({ message: "Nomor pesanan tidak valid." });

    const [[row]] = await db.query(
      `SELECT o.id, o.payment_status, u.name
         FROM orders o
         JOIN users u ON u.id = o.user_id
        WHERE o.id = ? AND o.user_id = ?
        LIMIT 1`,
      [orderId, userId]
    );

    if (!row) return res.status(404).json({ message: "Pesanan tidak ditemukan." });
    if (row.payment_status !== "pending") {
      return res.status(409).json({ message: "Pesanan ini sudah diproses sebelumnya." });
    }

    req.namaPembeli = row.name;
    next();
  } catch (err) {
    next(err);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DIR),
  filename: (req, file, cb) => {
    // contoh: icha-putri-u2-order15-1794626548031.png
    const nama = slug(req.namaPembeli);
    const ext = EXT[file.mimetype] ?? ".png";
    cb(null, `${nama}-u${req.user.id}-order${req.params.orderId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) cb(null, true);
    else cb(new Error("Format gambar harus PNG atau JPG."));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/** Field form-data harus bernama "struk". */
export const uploadStruk = (req, res, next) =>
  upload.single("struk")(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "Maksimal ukuran file 5MB." : err.message;
    return res.status(400).json({ message });
  });

/** Balasan setelah gambar tersimpan. */
export const balasStruk = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Gambar konfirmasi tidak ditemukan." });
  }
  return res.json({
    ok: true,
    file: req.file.filename,
    message: "Konfirmasi pembayaran tercatat.",
  });
};