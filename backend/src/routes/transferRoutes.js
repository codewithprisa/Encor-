import express from "express";
import {
  cariUser,
  buatTransfer,
  terimaTransfer,
  tolakTransfer,
  batalTransfer,
} from "../controllers/transferController.js";

// Sesuaikan dengan cara file middleware kamu meng-export
import authMiddleware from "../middleware/authMiddleware.js";

/* ───── /api/transfer ───── */
const router = express.Router();

router.post("/", authMiddleware, buatTransfer);
router.put("/:id/terima", authMiddleware, terimaTransfer);
router.put("/:id/tolak", authMiddleware, tolakTransfer);
router.put("/:id/batal", authMiddleware, batalTransfer);

export default router;

/* ───── /api/users/search ───── */
export const userSearchRouter = express.Router();
userSearchRouter.get("/", authMiddleware, cariUser);

/*
 * Daftarkan di server (app.js / index.js):
 *
 *   import transferRoutes, { userSearchRouter } from "./routes/transferRoutes.js";
 *   app.use("/api/users/search", userSearchRouter); // taruh SEBELUM router "/api/users" yang lama (kalau ada)
 *   app.use("/api/transfer", transferRoutes);
 */

/* ───────────────────────── SQL migrasi (jalankan sekali) ─────────────────────────

-- 1) ticket_transfers: tambah pesan + status 'cancelled'
ALTER TABLE ticket_transfers
  ADD COLUMN message VARCHAR(200) NULL AFTER receiver_id,
  MODIFY status ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending';

-- 2) notifications: tambah tipe 'transfer'
ALTER TABLE notifications
  MODIFY type ENUM('payment','event','refund','wishlist','ticket','broadcast','transfer') NOT NULL;

-- 3) (opsional) index supaya cek transfer pending cepat
CREATE INDEX idx_tt_item_status ON ticket_transfers (order_item_id, status);

─────────────────────────────────────────────────────────────────────────── */