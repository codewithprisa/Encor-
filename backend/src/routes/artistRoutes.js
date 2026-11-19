import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import {
  getArtists,
  getArtistById,
  createArtist,
  updateArtist,
  deleteArtist,
} from "../controllers/artistController.js";

const router = Router();

// dibuka untuk umum (dipakai juga aplikasi mobile)
router.get("/", getArtists); // ?q=<nama>&genre=<genreId>
router.get("/:id", getArtistById);

// khusus admin
router.post("/", authMiddleware, adminMiddleware, createArtist);
router.put("/:id", authMiddleware, adminMiddleware, updateArtist);
router.delete("/:id", authMiddleware, adminMiddleware, deleteArtist);

export default router;