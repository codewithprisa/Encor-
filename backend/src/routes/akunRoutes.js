import { Router } from "express";
import * as authMw from "../middleware/authMiddleware.js";
import * as adminMw from "../middleware/adminMiddleware.js";
import { listAkun, ubahRole } from "../controllers/userController.js";

// Ambil middleware dari file kamu, apa pun nama export-nya.
// Setelah ketemu namanya, boleh diganti jadi import biasa.
const requireLogin =
  authMw.requireLogin ?? authMw.authMiddleware ?? authMw.verifyToken ?? authMw.default;
const requireAdmin =
  adminMw.requireAdmin ?? adminMw.adminMiddleware ?? adminMw.isAdmin ?? adminMw.default;

if (typeof requireLogin !== "function" || typeof requireAdmin !== "function") {
  throw new Error(
    "akunRoutes: middleware tidak ditemukan. Export authMiddleware: " +
      Object.keys(authMw).join(", ") +
      " | Export adminMiddleware: " +
      Object.keys(adminMw).join(", ")
  );
}

const router = Router();
router.use(requireLogin, requireAdmin);
router.get("/", listAkun);
router.patch("/:id/role", ubahRole);

export default router;