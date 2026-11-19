import express from "express";
import {
  getEvents,
  createEvent,
  getEventById,
  updateEvent,
  deleteEvent
} from "../controllers/eventController.js";
import { getByEvent, create } from "../controllers/ticketTypeController.js";
import { getDenah, saveDenah } from "../controllers/seatController.js";

const router = express.Router();

router.get("/", getEvents);
router.post("/", createEvent);

router.get("/:id/kategori", getByEvent);
router.post("/:id/kategori", create);

router.get("/:id/denah", getDenah);
router.put("/:id/denah", saveDenah);

router.get("/:id", getEventById);
router.put("/:id", updateEvent);
router.delete("/:id", deleteEvent);

export default router;