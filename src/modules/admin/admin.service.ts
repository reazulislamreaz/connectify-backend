import mongoose from "mongoose";
import { User, type UserRole, type AccountStatus } from "../auth/auth.model";
import { Post, PostLike, Comment } from "../post/post.model";
import { Message } from "../message/message.model";
import { Report, AuditLog } from "./admin.model";
import { AppError } from "../../utils/AppError";
import { resolveImageUrl, deleteFromS3ByUrl } from "../../config/s3";
import { ADMIN_USER_SELECT } from "../../constants/queryFields";
import { cacheInvalidate } from "../../cache/invalidate";
import { disconnectUser, getConnectionCount } from "../../socket/message.events";
import type {
  UpdateUserInput,
  ResolveReportInput,
  CreateReportInput,
} from "./admin.validation";

const DAY = 86_400_000;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Actor {
  id: string;
  role: UserRole;
}

interface TimePoint {
  date: string;
  count: number;
}

function startOfTodayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function last14DayKeys(): { keys: string[]; since: Date } {
  const base = startOfTodayUTC();
  const keys: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base.getTime() - i * DAY);
    keys.push(d.toISOString().slice(0, 10));
  }
  return { keys, since: new Date(base.getTime() - 13 * DAY) };
}

function dailyCounts(
  rows: { _id: string; c: number }[],
  keys: string[],
): TimePoint[] {
  const map = new Map(rows.map((r) => [r._id, r.c]));
  return keys.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

const dayAgg = (field: string, since: Date, extra: Record<string, unknown> = {}) => [
  { $match: { [field]: { $gte: since }, ...extra } },
  {
    $group: {
      _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field}` } },
      c: { $sum: 1 },
    },
  },
];

export class AdminService {
  private async audit(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, unknown>,
  ) {
    await AuditLog.create({ actorId, action, targetType, targetId, metadata });
  }

  /* ───────────────────────────── stats ───────────────────────────── */
  async getStats() {
    const today = startOfTodayUTC();
    const weekAgo = new Date(today.getTime() - 6 * DAY);
    const { keys, since } = last14DayKeys();

    const [
      total,
      suspended,
      banned,
      onlineNow,
      newToday,
      newThisWeek,
      postsTotal,
      postsToday,
      commentsToday,
      messagesToday,
      callsToday,
      open,
      resolvedToday,
      signupRows,
      messageRows,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ status: "suspended" }),
      User.countDocuments({ status: "banned" }),
      User.countDocuments({ isOnline: true }),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      Post.countDocuments({}),
      Post.countDocuments({ createdAt: { $gte: today } }),
      Comment.countDocuments({ createdAt: { $gte: today } }),
      Message.countDocuments({ messageType: "text", createdAt: { $gte: today } }),
      Message.countDocuments({ messageType: "call", createdAt: { $gte: today } }),
      Report.countDocuments({ status: "open" }),
      Report.countDocuments({ status: "resolved", resolvedAt: { $gte: today } }),
      User.aggregate(dayAgg("createdAt", since)),
      Message.aggregate(dayAgg("createdAt", since, { messageType: "text" })),
    ]);

    return {
      users: {
        total,
        active: Math.max(0, total - suspended - banned),
        suspended,
        banned,
        onlineNow,
        newToday,
        newThisWeek,
      },
      content: { postsTotal, postsToday, commentsToday },
      messaging: { messagesToday, callsToday },
      reports: { open, resolvedToday },
      series: {
        signups: dailyCounts(signupRows, keys),
        messages: dailyCounts(messageRows, keys),
      },
    };
  }

  /* ───────────────────────────── users ───────────────────────────── */
  async listUsers(f: {
    search?: string;
    status: AccountStatus | "all";
    role: UserRole | "all";
    page: number;
    limit: number;
  }) {
    const filter: Record<string, unknown> = {};
    if (f.status !== "all") filter.status = f.status;
    if (f.role !== "all") filter.role = f.role;
    if (f.search) {
      const rx = new RegExp(escapeRegex(f.search), "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const skip = (f.page - 1) * f.limit;
    const [docs, total] = await Promise.all([
      User.find(filter)
        .select(ADMIN_USER_SELECT)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(f.limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const ids = docs.map((d) => d._id);
    const idStrings = ids.map(String);
    const [postCounts, reportCounts] = await Promise.all([
      Post.aggregate([
        { $match: { authorId: { $in: ids } } },
        { $group: { _id: "$authorId", c: { $sum: 1 } } },
      ]),
      Report.aggregate([
        { $match: { targetType: "user", targetId: { $in: idStrings }, status: "open" } },
        { $group: { _id: "$targetId", c: { $sum: 1 } } },
      ]),
    ]);
    const postMap = new Map(postCounts.map((r) => [String(r._id), r.c]));
    const reportMap = new Map(reportCounts.map((r) => [String(r._id), r.c]));

    return {
      users: docs.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        profilePicture: resolveImageUrl(u.profilePicture),
        role: (u.role ?? "user") as UserRole,
        status: (u.status ?? "active") as AccountStatus,
        isOnline: !!u.isOnline,
        lastSeen: u.lastSeen,
        createdAt: u.createdAt,
        postsCount: postMap.get(u._id.toString()) ?? 0,
        reportsAgainst: reportMap.get(u._id.toString()) ?? 0,
      })),
      pagination: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / f.limit)),
      },
    };
  }

  async updateUser(actor: Actor, id: string, input: UpdateUserInput) {
    const target = await User.findById(id).select("role status name").lean();
    if (!target) throw new AppError(404, "User not found");

    if (id === actor.id && input.status && input.status !== "active") {
      throw new AppError(400, "You can't suspend or ban your own account");
    }
    // Only an admin may act on another admin (suspend/ban/role).
    if (target.role === "admin" && actor.role !== "admin") {
      throw new AppError(403, "Only an admin can modify another admin");
    }
    // Role changes are admin-only.
    if (input.role && actor.role !== "admin") {
      throw new AppError(403, "Only an admin can change roles");
    }

    const update: Record<string, unknown> = {};

    if (input.status && input.status !== target.status) {
      update.status = input.status;
      if (input.status === "suspended" && input.suspendedUntil) {
        update.suspendedUntil = input.suspendedUntil;
      }
      if (input.status === "active") {
        update.$unset = { suspendedUntil: "" };
      }
    }
    if (input.role && input.role !== target.role) {
      update.role = input.role;
    }

    if (Object.keys(update).length === 0) {
      return { id, role: target.role, status: target.status };
    }

    await User.findByIdAndUpdate(id, update);

    // Status changes must take effect now: kick live sessions + bust caches.
    if (update.status === "banned" || update.status === "suspended") {
      disconnectUser(id);
    }
    await cacheInvalidate.authMe(id);

    if (update.status) {
      await this.audit(actor.id, `user.${update.status}`, "user", id, {
        name: target.name,
      });
    }
    if (update.role) {
      await this.audit(actor.id, "user.role_change", "user", id, {
        from: target.role,
        to: update.role,
      });
    }

    return {
      id,
      role: (update.role ?? target.role) as UserRole,
      status: (update.status ?? target.status) as AccountStatus,
    };
  }

  async forceLogout(actor: Actor, id: string) {
    const user = await User.findById(id).select("name").lean();
    if (!user) throw new AppError(404, "User not found");
    disconnectUser(id);
    await User.findByIdAndUpdate(id, { isOnline: false });
    await this.audit(actor.id, "user.force_logout", "user", id, {
      name: user.name,
    });
    return { success: true };
  }

  /* ───────────────────────────── posts ───────────────────────────── */
  async listPosts(f: {
    search?: string;
    reportedOnly: boolean;
    page: number;
    limit: number;
  }) {
    const filter: Record<string, unknown> = {};
    if (f.search) filter.content = new RegExp(escapeRegex(f.search), "i");

    if (f.reportedOnly) {
      const reportedIds = await Report.distinct("targetId", {
        targetType: "post",
        status: "open",
      });
      filter._id = {
        $in: reportedIds.filter((x) => mongoose.isValidObjectId(x)),
      };
    }

    const skip = (f.page - 1) * f.limit;
    const [docs, total] = await Promise.all([
      Post.find(filter)
        .select("authorId content imageUrl likesCount commentsCount hidden createdAt")
        .populate("authorId", "name profilePicture")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(f.limit)
        .lean(),
      Post.countDocuments(filter),
    ]);

    const idStrings = docs.map((p) => p._id.toString());
    const reportCounts = await Report.aggregate([
      { $match: { targetType: "post", targetId: { $in: idStrings }, status: "open" } },
      { $group: { _id: "$targetId", c: { $sum: 1 } } },
    ]);
    const reportMap = new Map(reportCounts.map((r) => [String(r._id), r.c]));

    return {
      posts: docs.map((p) => {
        const author = p.authorId as unknown as {
          _id: mongoose.Types.ObjectId;
          name?: string;
          profilePicture?: string;
        } | null;
        return {
          id: p._id.toString(),
          content: p.content,
          imageUrl: resolveImageUrl(p.imageUrl),
          author: {
            id: author?._id?.toString() ?? "",
            name: author?.name ?? "Unknown",
            profilePicture: resolveImageUrl(author?.profilePicture),
          },
          likesCount: p.likesCount,
          commentsCount: p.commentsCount,
          reportsCount: reportMap.get(p._id.toString()) ?? 0,
          hidden: !!p.hidden,
          createdAt: p.createdAt,
        };
      }),
      pagination: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / f.limit)),
      },
    };
  }

  async setPostHidden(actor: Actor, id: string, hidden: boolean) {
    const post = await Post.findByIdAndUpdate(id, { hidden }, { new: false });
    if (!post) throw new AppError(404, "Post not found");
    await cacheInvalidate.feedAll();
    await this.audit(actor.id, hidden ? "post.hide" : "post.unhide", "post", id);
    return { id, hidden };
  }

  async deletePost(actor: Actor, id: string) {
    const post = await Post.findById(id).select("imageUrl").lean();
    if (!post) throw new AppError(404, "Post not found");

    await Promise.all([
      Post.findByIdAndDelete(id),
      PostLike.deleteMany({ postId: id }),
      Comment.deleteMany({ postId: id }),
    ]);
    if (post.imageUrl) {
      await deleteFromS3ByUrl(resolveImageUrl(post.imageUrl)).catch(() => undefined);
    }
    await cacheInvalidate.feedAll();
    await this.audit(actor.id, "post.delete", "post", id);
    return { success: true };
  }

  /* ──────────────────────────── reports ───────────────────────────── */
  async listReports(f: {
    status: "all" | "open" | "resolved" | "dismissed";
    page: number;
    limit: number;
  }) {
    const filter: Record<string, unknown> =
      f.status === "all" ? {} : { status: f.status };

    const skip = (f.page - 1) * f.limit;
    const [docs, total] = await Promise.all([
      Report.find(filter)
        .populate("reporterId", "name profilePicture")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(f.limit)
        .lean(),
      Report.countDocuments(filter),
    ]);

    // Batch-enrich previews for post/user targets (no per-row queries).
    const postIds = docs
      .filter((r) => r.targetType === "post" && mongoose.isValidObjectId(r.targetId))
      .map((r) => r.targetId);
    const userIds = docs
      .filter((r) => r.targetType === "user" && mongoose.isValidObjectId(r.targetId))
      .map((r) => r.targetId);

    const [posts, users] = await Promise.all([
      postIds.length
        ? Post.find({ _id: { $in: postIds } }).select("content").lean()
        : [],
      userIds.length
        ? User.find({ _id: { $in: userIds } }).select("name").lean()
        : [],
    ]);
    const postMap = new Map(posts.map((p) => [p._id.toString(), p.content]));
    const userMap = new Map(users.map((u) => [u._id.toString(), u.name]));

    const preview = (r: (typeof docs)[number]): string => {
      if (r.targetType === "message")
        return "Message reported by recipient (content hidden)";
      if (r.targetType === "user")
        return `Profile: ${userMap.get(r.targetId) ?? "unknown user"}`;
      if (r.targetType === "post") {
        const c = postMap.get(r.targetId);
        return c ? c.slice(0, 140) : "Post has been removed";
      }
      return `Comment ${r.targetId}`;
    };

    return {
      reports: docs.map((r) => {
        const reporter = r.reporterId as unknown as {
          _id: mongoose.Types.ObjectId;
          name?: string;
          profilePicture?: string;
        } | null;
        return {
          id: r._id.toString(),
          reporter: {
            id: reporter?._id?.toString() ?? "",
            name: reporter?.name ?? "Unknown",
            profilePicture: resolveImageUrl(reporter?.profilePicture),
          },
          targetType: r.targetType,
          targetId: r.targetId,
          targetPreview: preview(r),
          reason: r.reason,
          note: r.note,
          status: r.status,
          createdAt: r.createdAt,
        };
      }),
      pagination: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / f.limit)),
      },
    };
  }

  async resolveReport(actor: Actor, id: string, input: ResolveReportInput) {
    const report = await Report.findById(id);
    if (!report) throw new AppError(404, "Report not found");

    report.status = input.status;
    report.resolvedBy = new mongoose.Types.ObjectId(actor.id);
    report.resolvedAt = new Date();
    if (input.action) report.action = input.action;
    await report.save();

    await this.audit(actor.id, `report.${input.status}`, "report", id, {
      ...(input.action ? { action: input.action } : {}),
      targetType: report.targetType,
      targetId: report.targetId,
    });
    return { id, status: input.status };
  }

  /** Public: any authenticated user can file a report. */
  async createReport(reporterId: string, input: CreateReportInput) {
    const report = await Report.create({
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      note: input.note,
    });
    return { id: report._id.toString(), status: report.status };
  }

  /* ───────────────────────────── audit ───────────────────────────── */
  async listAudit(f: { page: number; limit: number }) {
    const skip = (f.page - 1) * f.limit;
    const [docs, total] = await Promise.all([
      AuditLog.find({})
        .populate("actorId", "name profilePicture")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(f.limit)
        .lean(),
      AuditLog.countDocuments({}),
    ]);

    return {
      entries: docs.map((e) => {
        const actor = e.actorId as unknown as {
          _id: mongoose.Types.ObjectId;
          name?: string;
        } | null;
        return {
          id: e._id.toString(),
          actor: {
            id: actor?._id?.toString() ?? "",
            name: actor?.name ?? "system",
          },
          action: e.action,
          targetType: e.targetType,
          targetId: e.targetId,
          metadata: e.metadata,
          createdAt: e.createdAt,
        };
      }),
      pagination: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / f.limit)),
      },
    };
  }

  /* ───────────────────────────── health ───────────────────────────── */
  async getHealth() {
    const presenceCount = await User.countDocuments({ isOnline: true });
    return {
      socketConnections: getConnectionCount(),
      apiOk: true,
      dbOk: mongoose.connection.readyState === 1,
      uptimeSeconds: Math.round(process.uptime()),
      presenceCount,
    };
  }
}

export const adminService = new AdminService();
