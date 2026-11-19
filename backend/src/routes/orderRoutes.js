import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import {
  getOrders,
  getOrderById,
  updatePaymentStatus,
  konfirmasiPesanan,
} from "../controllers/orderController.js";

const router = Router();

// semua route pesanan di sini khusus admin
router.use(authMiddleware, adminMiddleware);

router.get("/", getOrders); // ?event=<eventId>&status=<Lunas|Menunggu|Gagal|Kedaluwarsa|Refund>&q=<invoice/nama/email>
router.get("/:id", getOrderById);
router.patch("/:id/konfirmasi", konfirmasiPesanan); // body: { aksi: "terima" | "tolak" }
router.patch("/:id/status", updatePaymentStatus); // body: { status: "Lunas" | "Gagal" | "Kedaluwarsa" }

export default router;