import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// backend/src/middleware -> backend/uploads (sama dengan folder yang di-serve di server.js)
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });


function createUpload(subfolder = "") {
  const dir = path.join(UPLOAD_DIR, subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const unik = Date.now() + "-" + Math.round(Math.random() * 1e6);
      cb(null, unik + path.extname(file.originalname));
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
  });
}

// Uploader per kategori
export const uploadPoster = createUpload("poster");
export const uploadProfile = createUpload("profile");
export const uploadArtis = createUpload("artis");
export const uploadReview = createUpload("review");

// Tetap ada supaya route lama tidak rusak (menyimpan ke root uploads/)
const upload = createUpload("");

export { upload, createUpload };
export default upload;