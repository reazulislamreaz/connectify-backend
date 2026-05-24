import { Post, PostLike, Comment } from "./post.model";
import { AppError } from "../../utils/AppError";
import {
  uploadImageToS3,
  resolveImageUrl,
  deleteFromS3ByUrl,
} from "../../config/s3";
import { isPopulatedUser, PopulatedUser } from "../../utils/populatedUser";
import { cache } from "../../cache/cache.service";
import { cacheInvalidate } from "../../cache/invalidate";
import { keys, TTL } from "../../cache/keys";

function formatAuthor(user: PopulatedUser) {
  return {
    id: user._id.toString(),
    name: user.name,
    profilePicture: resolveImageUrl(user.profilePicture),
  };
}

export class PostService {
  async createPost(
    userId: string,
    content: string,
    imageFile?: Express.Multer.File
  ) {
    const trimmedContent = content?.trim() ?? "";

    if (!trimmedContent && !imageFile) {
      throw new AppError(400, "Post must have text or an image");
    }

    let imageUrl = "";
    if (imageFile) {
      imageUrl = await uploadImageToS3(imageFile, "posts");
    }

    const post = await Post.create({
      authorId: userId,
      content: trimmedContent,
      imageUrl,
    });

    const populated = await Post.findById(post._id)
      .populate("authorId", "name profilePicture")
      .lean();

    if (!populated || !isPopulatedUser(populated.authorId)) {
      throw new AppError(500, "Failed to create post");
    }

    await cacheInvalidate.feedAll();

    return {
      id: populated._id.toString(),
      content: populated.content,
      imageUrl: resolveImageUrl(populated.imageUrl),
      author: formatAuthor(populated.authorId),
      likesCount: 0,
      commentsCount: 0,
      isLiked: false,
      createdAt: populated.createdAt,
    };
  }

  async getFeed(userId: string, page = 1, limit = 20) {
    const globalVersion =
      (await cache.getCounter(keys.feedGlobalVersion())) ?? 0;
    const cacheKey = keys.feed(userId, globalVersion, page);

    return cache.getOrSet(cacheKey, TTL.FEED, () =>
      this.fetchFeed(userId, page, limit)
    );
  }

  private async fetchFeed(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      Post.find()
        .select("authorId content imageUrl likesCount commentsCount createdAt")
        .populate("authorId", "name profilePicture")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(),
    ]);

    const postIds = posts.map((p) => p._id);

    const userLikes = await PostLike.find({
      postId: { $in: postIds },
      userId,
    })
      .select("postId")
      .lean();

    const likedSet = new Set(userLikes.map((l) => l.postId.toString()));

    return {
      posts: posts.map((p) => {
        if (!isPopulatedUser(p.authorId)) {
          throw new AppError(500, "Failed to load post author");
        }
        return {
          id: p._id.toString(),
          content: p.content,
          imageUrl: resolveImageUrl(p.imageUrl),
          author: formatAuthor(p.authorId),
          likesCount: p.likesCount,
          commentsCount: p.commentsCount,
          isLiked: likedSet.has(p._id.toString()),
          createdAt: p.createdAt,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async toggleLike(postId: string, userId: string) {
    const post = await Post.findById(postId).select("_id likesCount").lean();
    if (!post) {
      throw new AppError(404, "Post not found");
    }

    const existing = await PostLike.findOne({ postId, userId }).select("_id").lean();

    if (existing) {
      await PostLike.deleteOne({ _id: existing._id });
      const updated = await Post.findByIdAndUpdate(
        postId,
        { $inc: { likesCount: -1 } },
        { new: true }
      )
        .select("likesCount")
        .lean();
      await cacheInvalidate.feedAll();
      return { liked: false, likesCount: Math.max(0, updated?.likesCount ?? 0) };
    }

    await PostLike.create({ postId, userId });
    const updated = await Post.findByIdAndUpdate(
      postId,
      { $inc: { likesCount: 1 } },
      { new: true }
    )
      .select("likesCount")
      .lean();

    await cacheInvalidate.feedAll();
    return { liked: true, likesCount: updated?.likesCount ?? 0 };
  }

  async addComment(postId: string, userId: string, content: string) {
    const post = await Post.findById(postId).select("_id").lean();
    if (!post) {
      throw new AppError(404, "Post not found");
    }

    const comment = await Comment.create({ postId, authorId: userId, content });

    await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 } });

    const populated = await Comment.findById(comment._id)
      .populate("authorId", "name profilePicture")
      .lean();

    if (!populated || !isPopulatedUser(populated.authorId)) {
      throw new AppError(500, "Failed to create comment");
    }

    await cacheInvalidate.comments(postId);
    await cacheInvalidate.feedAll();

    return {
      id: populated._id.toString(),
      postId: populated.postId.toString(),
      content: populated.content,
      author: formatAuthor(populated.authorId),
      createdAt: populated.createdAt,
    };
  }

  async getComments(postId: string, page = 1, limit = 30) {
    const post = await Post.findById(postId).select("_id").lean();
    if (!post) {
      throw new AppError(404, "Post not found");
    }

    if (page <= 3) {
      return cache.getOrSet(
        keys.comments(postId, page),
        TTL.COMMENTS,
        () => this.fetchComments(postId, page, limit)
      );
    }

    return this.fetchComments(postId, page, limit);
  }

  private async fetchComments(postId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      Comment.find({ postId })
        .select("postId content createdAt")
        .populate("authorId", "name profilePicture")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Comment.countDocuments({ postId }),
    ]);

    return {
      comments: comments.map((c) => {
        if (!isPopulatedUser(c.authorId)) {
          throw new AppError(500, "Failed to load comment author");
        }
        return {
          id: c._id.toString(),
          postId: c.postId.toString(),
          content: c.content,
          author: formatAuthor(c.authorId),
          createdAt: c.createdAt,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updatePost(
    postId: string,
    userId: string,
    content?: string,
    imageFile?: Express.Multer.File,
    removeImage = false
  ) {
    const post = await Post.findById(postId);
    if (!post) {
      throw new AppError(404, "Post not found");
    }
    if (post.authorId.toString() !== userId) {
      throw new AppError(403, "Not authorized to edit this post");
    }

    const trimmedContent =
      content !== undefined ? content.trim() : post.content || "";

    let imageUrl = post.imageUrl || "";
    if (removeImage && imageUrl) {
      await deleteFromS3ByUrl(resolveImageUrl(imageUrl));
      imageUrl = "";
    }
    if (imageFile) {
      if (imageUrl) await deleteFromS3ByUrl(resolveImageUrl(imageUrl));
      imageUrl = await uploadImageToS3(imageFile, "posts");
    }

    if (!trimmedContent && !imageUrl) {
      throw new AppError(400, "Post must have text or an image");
    }

    post.content = trimmedContent;
    post.imageUrl = imageUrl;
    await post.save();

    const populated = await Post.findById(post._id)
      .populate("authorId", "name profilePicture")
      .lean();

    if (!populated || !isPopulatedUser(populated.authorId)) {
      throw new AppError(500, "Failed to update post");
    }

    const liked = await PostLike.exists({ postId, userId });

    await cacheInvalidate.feedAll();

    return {
      id: populated._id.toString(),
      content: populated.content,
      imageUrl: resolveImageUrl(populated.imageUrl),
      author: formatAuthor(populated.authorId),
      likesCount: populated.likesCount,
      commentsCount: populated.commentsCount,
      isLiked: Boolean(liked),
      createdAt: populated.createdAt,
    };
  }

  async updateComment(commentId: string, userId: string, content: string) {
    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new AppError(404, "Comment not found");
    }
    if (comment.authorId.toString() !== userId) {
      throw new AppError(403, "Not authorized to edit this comment");
    }

    comment.content = content.trim();
    await comment.save();

    const populated = await Comment.findById(comment._id)
      .populate("authorId", "name profilePicture")
      .lean();

    if (!populated || !isPopulatedUser(populated.authorId)) {
      throw new AppError(500, "Failed to update comment");
    }

    await cacheInvalidate.comments(populated.postId.toString());

    return {
      id: populated._id.toString(),
      postId: populated.postId.toString(),
      content: populated.content,
      author: formatAuthor(populated.authorId),
      createdAt: populated.createdAt,
    };
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new AppError(404, "Comment not found");
    }
    if (comment.authorId.toString() !== userId) {
      throw new AppError(403, "Not authorized to delete this comment");
    }

    await Comment.findByIdAndDelete(commentId);
    const post = await Post.findById(comment.postId).select("commentsCount");
    if (post && post.commentsCount > 0) {
      post.commentsCount -= 1;
      await post.save();
    }

    await cacheInvalidate.comments(comment.postId.toString());
    await cacheInvalidate.feedAll();

    return { message: "Comment deleted", postId: comment.postId.toString() };
  }

  async deletePost(postId: string, userId: string) {
    const post = await Post.findById(postId).lean();
    if (!post) {
      throw new AppError(404, "Post not found");
    }
    if (post.authorId.toString() !== userId) {
      throw new AppError(403, "Not authorized to delete this post");
    }

    if (post.imageUrl) {
      await deleteFromS3ByUrl(resolveImageUrl(post.imageUrl));
    }

    await Promise.all([
      PostLike.deleteMany({ postId }),
      Comment.deleteMany({ postId }),
      Post.findByIdAndDelete(postId),
    ]);

    await cacheInvalidate.comments(postId);
    await cacheInvalidate.feedAll();

    return { message: "Post deleted" };
  }
}

export const postService = new PostService();
