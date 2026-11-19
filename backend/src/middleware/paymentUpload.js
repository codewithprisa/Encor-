import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/src/middleware -> backend/uploads/payment
const DIR = path.join(__dirname, "..", "..", "uploads", "payment");
fs.mkdirSync(DIR, { recursive: true });

const EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
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
 * Pasang SEBELUM upload.single("bukti").
 * Mengambil nama user yang login untuk dipakai sebagai nama file.
 */
export async function siapkanNamaBukti(req, res, next) {
  try {
    const userId = req.user?.id;
    const orderId = Number(req.params.orderId);

    if (!userId) return res.status(401).json({ message: "Silakan login dulu." });
    if (!orderId) return res.status(400).json({ message: "Nomor pesanan tidak valid." });

    const [[u]] = await db.query(
      "SELECT name FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    req.namaPembeli = u?.name ?? req.user?.name ?? "user";
    next();
  } catch (err) {
    next(err);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DIR),
  filename: (req, file, cb) => {
    // contoh: icha-putri-u2-order15-1794626548031.jpg
    const nama = slug(req.namaPembeli);
    const ext = EXT[file.mimetype] ?? ".jpg";
    cb(null, `${nama}-u${req.user.id}-order${req.params.orderId}-${Date.now()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (EXT[file.mimetype]) cb(null, true);
  else cb(new Error("Format file harus JPG, PNG, atau WEBP."));
};

export default multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});