import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import {
  getRefunds,
  approveRefund,
  rejectRefund,
  deleteRefund,
  bulkRefund,
  createRefund,
  getMyRefunds,
  deleteMyRefund,
} from "../controllers/refundController.js";

const router = Router();

// User (aplikasi mobile): cukup login. "/saya" harus di atas "/:id"
router.get("/saya", authMiddleware, getMyRefunds);
router.delete("/saya/:id", authMiddleware, deleteMyRefund);
router.post("/", authMiddleware, createRefund);

// Admin (dashboard)
router.post("/bulk", authMiddleware, adminMiddleware, bulkRefund);
router.get("/", authMiddleware, adminMiddleware, getRefunds);
router.patch("/:id/terima", authMiddleware, adminMiddleware, approveRefund);
router.patch("/:id/tolak", authMiddleware, adminMiddleware, rejectRefund);
router.delete("/:id", authMiddleware, adminMiddleware, deleteRefund);

export default router;