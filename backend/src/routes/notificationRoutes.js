import express from "express";
import {
  getUsers,
  getHistory,
  sendNotification,
  getMyNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  deleteNotification,
} from "../controllers/notificationController.js";

// Sesuaikan dengan cara file middleware kamu meng-export
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

/* ───── USER (mobile) ─────
   Harus di atas route "/" agar "/me" tidak ketabrak */
router.get("/me", authMiddleware, getMyNotifications);
router.get("/me/unread-count", authMiddleware, getUnreadCount);
router.put("/me/read-all", authMiddleware, markAllAsRead); // harus di atas /me/:id/read
router.put("/me/:id/read", authMiddleware, markAsRead);
router.delete("/me/:id", authMiddleware, deleteNotification);

/* ───── ADMIN (dashboard) ───── */
router.get("/users", authMiddleware, adminMiddleware, getUsers);
router.get("/", authMiddleware, adminMiddleware, getHistory);
router.post("/", authMiddleware, adminMiddleware, sendNotification);

export default router;