import { Router } from "express";
import { messageController } from "./message.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  sendMessageSchema,
  updateMessageSchema,
  getMessagesSchema,
  markReadSchema,
} from "./message.validation";
import {
  uploadMessageImage,
  uploadMessageMedia,
} from "../../middleware/upload.middleware";

const router = Router();

router.use(authenticate);

const withImageUpload = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) => {
  uploadMessageImage.single("image")(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

const withMediaUpload = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) => {
  uploadMessageMedia(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

router.post("/", withMediaUpload, validate(sendMessageSchema), messageController.sendMessage);
router.patch("/read", validate(markReadSchema), messageController.markAsRead);
router.patch("/:id", withImageUpload, validate(updateMessageSchema), messageController.updateMessage);
router.delete("/:id", messageController.deleteMessage);
router.get(
  "/:userId",
  validate(getMessagesSchema, "query"),
  messageController.getConversation
);

export default router;
