import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { postService } from "./post.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { getParamId } from "../../utils/params";

export class PostController {
  createPost = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { content } = req.body;
    const post = await postService.createPost(
      req.user!.userId,
      content,
      req.file
    );
    res.status(201).json({ success: true, data: post });
  });

  getFeed = asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const feed = await postService.getFeed(req.user!.userId, page, limit);
    res.json({ success: true, data: feed });
  });

  updatePost = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { content, removeImage } = req.body;
    const post = await postService.updatePost(
      getParamId(req.params.id),
      req.user!.userId,
      content,
      req.file,
      removeImage
    );
    res.json({ success: true, data: post });
  });

  toggleLike = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await postService.toggleLike(
      getParamId(req.params.id),
      req.user!.userId
    );
    res.json({ success: true, data: result });
  });

  addComment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { content } = req.body;
    const comment = await postService.addComment(
      getParamId(req.params.id),
      req.user!.userId,
      content
    );
    res.status(201).json({ success: true, data: comment });
  });

  getComments = asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 30;
    const comments = await postService.getComments(
      getParamId(req.params.id),
      page,
      limit
    );
    res.json({ success: true, data: comments });
  });

  updateComment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { content } = req.body;
    const comment = await postService.updateComment(
      getParamId(req.params.commentId),
      req.user!.userId,
      content
    );
    res.json({ success: true, data: comment });
  });

  deleteComment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await postService.deleteComment(
      getParamId(req.params.commentId),
      req.user!.userId
    );
    res.json({ success: true, data: result });
  });

  deletePost = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await postService.deletePost(
      getParamId(req.params.id),
      req.user!.userId
    );
    res.json({ success: true, data: result });
  });
}

export const postController = new PostController();
