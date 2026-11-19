import express from "express";
import { getDashboard } from "../controllers/dashboardController.js";
import { requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", requireAdmin, getDashboard);

export default router;