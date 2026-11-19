import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/uploads/profile
export const PROFILE_DIR = path.join(__dirname, "../../uploads/profile");
fs.mkdirSync(PROFILE_DIR, { recursive: true });

// ===== Auth =====
export const authenticate = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Token tidak ditemukan. Silakan login." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = decoded.id ?? decoded.userId ?? decoded.user_id;
    if (!id) {
      return res
        .status(401)
        .json({ success: false, message: "Token tidak valid. Silakan login ulang." });
    }
    req.user = { ...decoded, id };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Token tidak valid atau sudah kedaluwarsa. Silakan login ulang.",
    });
  }
};

// ===== Upload foto profil =====
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PROFILE_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `profile-${req.user.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Format foto harus JPG, PNG, atau WEBP."));
  },
}).single("photo");

export const uploadProfilePhoto = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE" ? "Ukuran foto maksimal 3 MB." : err.message;
      return res.status(400).json({ success: false, message });
    }
    next();
  });
};