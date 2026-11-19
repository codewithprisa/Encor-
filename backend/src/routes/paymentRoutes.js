import { Router } from "express";

import * as authMw from "../middleware/authMiddleware.js";
import * as adminMw from "../middleware/adminMiddleware.js";
import upload, { siapkanNamaBukti } from "../middleware/paymentUpload.js";
import { siapkanStruk, uploadStruk, balasStruk } from "../middleware/strukUpload.js";
import {
  uploadBukti,
  daftarMetode,
  daftarMetodeAktif,
  tambahMetode,
  ubahStatusMetode,
  hapusMetode,
} from "../controllers/paymentController.js";

const requireLogin = authMw.requireLogin ?? authMw.default;
const requireAdmin =
  adminMw.requireAdmin ?? adminMw.isAdmin ?? adminMw.adminOnly ?? adminMw.default;

const router = Router();

/* ---------- Metode pembayaran ---------- */
// Urutan penting: "/metode/aktif" harus sebelum "/metode/:id"
router.get("/metode/aktif", requireLogin, daftarMetodeAktif); // checkout user
router.get("/metode", requireLogin, requireAdmin, daftarMetode); // admin
router.post("/metode", requireLogin, requireAdmin, tambahMetode);
router.patch("/metode/:id/status", requireLogin, requireAdmin, ubahStatusMetode);
router.delete("/metode/:id", requireLogin, requireAdmin, hapusMetode);

/* ---------- "Saya sudah bayar": gambar konfirmasi otomatis -> uploads/payment-user ---------- */
router.post(
  "/:orderId/konfirmasi",
  requireLogin,
  siapkanStruk,
  uploadStruk,
  balasStruk
);

/* ---------- "Upload": foto bukti dari user -> uploads/payment (nama file = nama user) ---------- */
router.post(
  "/:orderId/bukti",
  requireLogin,
  siapkanNamaBukti, // ambil nama user dulu
  upload.single("bukti"), // multer -> uploads/payment
  uploadBukti
);

export default router;