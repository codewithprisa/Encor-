import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import {
  getGenres,
  getGenreById,
  createGenre,
  updateGenre,
  deleteGenre,
} from "../controllers/genreController.js";

const router = Router();

// dibuka untuk umum (dipakai juga aplikasi mobile)
router.get("/", getGenres); // ?q=<nama>
router.get("/:id", getGenreById);

// khusus admin
router.post("/", authMiddleware, adminMiddleware, createGenre);
router.put("/:id", authMiddleware, adminMiddleware, updateGenre);
router.delete("/:id", authMiddleware, adminMiddleware, deleteGenre); // ?paksa=1 kalau genre masih dipakai event

export default router;