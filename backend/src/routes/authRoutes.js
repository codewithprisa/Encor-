import express from "express";
import { loginAdmin, loginUser, register  } from "../controllers/authController.js";

const router = express.Router();

router.post("/admin/login", loginAdmin);
router.post("/login", loginUser);
router.post("/register", register);

export default router;