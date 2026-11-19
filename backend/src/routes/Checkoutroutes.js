import { Router } from "express";
// Samakan nama & path middleware ini dengan yang dipakai di file Checkoutroutes.js kamu sekarang.
import { requireLogin as verifyToken } from "../middleware/authMiddleware.js";
import { createOrder, tiketSaya } from "../controllers/Checkoutcontroller.js";

const router = Router();

// POST /api/checkout
router.post("/", verifyToken, createOrder);

// GET /api/checkout/tiket
router.get("/tiket", verifyToken, tiketSaya);

export default router;