// backend/src/routes/wishlistRoutes.js
import { Router } from "express";
// Import namespace supaya tidak crash walau nama export middleware berbeda-beda.
import * as authModule from "../middleware/authMiddleware.js";
import { getWishlist, addWishlist, removeWishlist } from "../controllers/wishlistController.js";

// Cari fungsi middleware auth dari berbagai kemungkinan nama export.
const guard =
  authModule.default ??
  authModule.verifyToken ??
  authModule.authenticate ??
  authModule.authenticateToken ??
  authModule.authMiddleware ??
  authModule.protect ??
  authModule.requireAuth ??
  authModule.auth ??
  Object.values(authModule).find((v) => typeof v === "function");

if (typeof guard !== "function") {
  throw new Error(
    "wishlistRoutes: middleware auth tidak ditemukan. Export yang ada: " + Object.keys(authModule).join(", ")
  );
}
console.log("[WISHLIST] middleware auth:", guard.name || "(anonim)");

const router = Router();

// Semua endpoint wishlist butuh login
router.use(guard);

router.get("/", getWishlist);
router.post("/:eventId", addWishlist);
router.delete("/:eventId", removeWishlist);

export default router;