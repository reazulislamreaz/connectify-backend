import { Router } from "express";
import { chatController } from "./chat.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.use(authenticate);
router.get("/", chatController.getChatList);
router.delete("/:userId", chatController.deleteConversation);

export default router;
