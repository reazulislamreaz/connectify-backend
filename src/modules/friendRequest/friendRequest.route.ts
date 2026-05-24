import { Router } from "express";
import { friendRequestController } from "./friendRequest.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { sendRequestSchema, respondRequestSchema } from "./friendRequest.validation";

const router = Router();

router.use(authenticate);

router.post("/", validate(sendRequestSchema), friendRequestController.sendRequest);
router.get("/received", friendRequestController.getPendingReceived);
router.get("/sent", friendRequestController.getPendingSent);
router.get("/friends", friendRequestController.getFriends);
router.patch(
  "/:id/respond",
  validate(respondRequestSchema),
  friendRequestController.respondToRequest
);
router.delete("/:id", friendRequestController.cancelRequest);

export default router;
