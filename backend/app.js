import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import authRoute from "./src/routes/authRoutes.js";
import dashboardRoute from "./src/routes/dashboardRoutes.js";
import eventRoute from "./src/routes/eventRoutes.js";
import ticketTypeRoute from "./src/routes/ticketTypeRoutes.js";
import artistRoutes from "./src/routes/artistRoutes.js";
import genreRoutes from "./src/routes/genreRoutes.js";
import orderRoutes from "./src/routes/orderRoutes.js";
import refundRoutes from "./src/routes/refundRoutes.js";
import paymentRoutes from "./src/routes/paymentRoutes.js";
import checkoutRoutes from "./src/routes/Checkoutroutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
import profileRoutes from "./src/routes/profileRoutes.js";
import wishlistRoutes from "./src/routes/wishlistRoutes.js";
import akunRoutes from "./src/routes/akunRoutes.js";
import transferRoutes, { userSearchRouter } from "./src/routes/transferRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Encoré API berjalan.",
  });
});

app.use("/api/auth", authRoute);
app.use("/api/dashboard", dashboardRoute);
app.use("/api/events", eventRoute);
app.use("/api/kategori", ticketTypeRoute);

app.use("/api/artis", artistRoutes);
app.use("/api/genre", genreRoutes);
app.use("/api/pesanan", orderRoutes);
app.use("/api/refund", refundRoutes);
app.use("/api/pembayaran", paymentRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/notifikasi", notificationRoutes);
app.use("/api/profil", profileRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/akun", akunRoutes);
app.use("/api/users/search", userSearchRouter);
app.use("/api/transfer", transferRoutes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server berjalan di port ${PORT}`);
});