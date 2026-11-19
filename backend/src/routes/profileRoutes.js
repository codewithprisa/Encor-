import express from "express";
import { authenticate, uploadProfilePhoto } from "../middleware/profileMiddleware.js";
import { getProfile, updateProfile, updatePassword, updatePhoto, getActivity } from "../controllers/profileController.js";

const router = express.Router();

// SEMENTARA untuk debug: catat setiap request yang masuk. Hapus kalau sudah beres.
router.use((req, res, next) => {
  console.log("REQ:", req.method, req.originalUrl, req.headers["content-type"]);
  next();
});

router.use(authenticate);

router.get("/", getProfile);
router.put("/", updateProfile);
router.put("/password", updatePassword);
router.put("/foto", uploadProfilePhoto, updatePhoto);
router.get("/aktivitas", getActivity);

export default router;