import express from "express";
import * as ticketType from "../controllers/ticketTypeController.js";

const router = express.Router();

router.put("/:id", ticketType.update);
router.delete("/:id", ticketType.remove);

export default router;