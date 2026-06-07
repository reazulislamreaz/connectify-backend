# Connectify API Reference

Base URL (local): `http://localhost:5001`

All JSON responses use a common envelope unless noted:

```json
{
  "success": true,
  "data": { }
}
```

Errors:

```json
{
  "success": false,
  "message": "Human-readable error"
}
```

Validation errors (HTTP 400) may include:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "email": ["Invalid email"]
  }
}
```

---

## Authentication

Protected routes accept either:

- Header: `Authorization: Bearer <jwt>`
- Cookie: `token` (HTTP-only, set on register/login)

### Roles & authorization

Each user has a `role` (`user` | `moderator` | `admin`) and a `status` (`active` | `suspended` | `banned`). The JWT carries the `role` as a convenience claim so the client can render staff UI, but it is **not** the security boundary.

- `/api/admin/*` requires **staff** (`moderator` or `admin`).
- A few destructive admin actions (role changes, hard post delete) require **`admin`**.
- The server re-reads `role` and `status` from the database on every staff request (`requireRole`), so a demotion, suspension, or ban takes effect immediately — even with an unexpired token.
- A `suspended` or `banned` account is rejected at login (`403`) and has its live sockets disconnected when the status is applied.

---

## Health

### `GET /health`

No authentication.

**Response `200`**

```json
{
  "success": true,
  "message": "Server is running",
  "redis": "connected"
}
```

`redis`: `"connected"` | `"error"` | `"disabled"`

---

## Auth — `/api/auth`

Auth routes use a stricter rate limit (see README). Register/login set an HTTP-only `token` cookie (7 days).

### `POST /api/auth/register`

**Body (JSON)**

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | 2–100 chars |
| `email` | string | Valid email |
| `password` | string | 6–128 chars |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "<objectId>",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "profilePicture": "https://...",
      "role": "user",
      "status": "active"
    }
  }
}
```

`role`: `"user"` | `"moderator"` | `"admin"` (set server-side only — never from registration input).
`status`: `"active"` | `"suspended"` | `"banned"`.

**Errors:** `409` email already registered

---

### `POST /api/auth/login`

**Body (JSON)**

| Field | Type |
|-------|------|
| `email` | string |
| `password` | string |

**Response `200`** — Same shape as register.

**Errors:** `401` invalid credentials

---

### `POST /api/auth/forgot-password`

Starts the password-reset flow. Always returns the same generic message (even for unknown emails) to avoid leaking which addresses are registered. If the email exists, a reset link is emailed **in the background** (non-blocking). The link is valid for **60 minutes**, single-use.

**Body (JSON)**

| Field | Type |
|-------|------|
| `email` | string |

**Response `200`**

```json
{
  "success": true,
  "data": { "message": "If an account exists for that email, we've sent a password reset link." }
}
```

---

### `POST /api/auth/reset-password`

Completes the reset using the token from the emailed link (`FRONTEND_URL/reset-password?token=...`). On success, sends a confirmation email in the background.

**Body (JSON)**

| Field | Type |
|-------|------|
| `token` | string (from the email link) |
| `password` | string (6–128) |
| `confirmPassword` | string (must match `password`) |

**Response `200`** — `{ success, data: { message } }`

**Errors:** `400` link invalid or expired

---

### `POST /api/auth/logout`

Clears the `token` cookie.

**Response `200`**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### `GET /api/auth/me`

🔒 Authenticated.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "<objectId>",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "profilePicture": "https://...",
    "role": "user",
    "status": "active",
    "address": "",
    "professional": "",
    "religious": "",
    "hobby": "",
    "relationStatus": "",
    "dateOfBirth": "1990-01-15",
    "isOnline": false,
    "lastSeen": "2026-05-24T12:00:00.000Z"
  }
}
```

`role` / `status` let the client decide whether to show staff UI (e.g. the admin dashboard). They are a **UI hint only** — every `/api/admin/*` route re-checks role and status against the database on each request.

---

### `PATCH /api/auth/change-password`

🔒 Authenticated.

**Body (JSON)**

| Field | Type |
|-------|------|
| `currentPassword` | string |
| `newPassword` | string (6–128) |
| `confirmPassword` | string (must match `newPassword`) |

**Response `200`**

```json
{
  "success": true,
  "data": { "message": "Password changed successfully" }
}
```

---

### `DELETE /api/auth/account`

🔒 Authenticated. Permanently deletes the user and related data.

**Body (JSON)**

| Field | Type |
|-------|------|
| `password` | string |

**Response `200`** — Clears session cookie.

---

## Users — `/api/users`

All routes require authentication.

### `GET /api/users/profile`

Current user's full profile (same fields as `/api/auth/me`).

---

### `PATCH /api/users/profile`

Update profile. Supports optional avatar upload.

**Content-Type:** `multipart/form-data`

| Field | Type | Notes |
|-------|------|-------|
| `profilePicture` | file | JPEG/PNG/GIF/WebP, max 5 MB |
| `name` | string | 2–100 chars, optional |
| `address` | string | max 500 |
| `professional` | string | max 200 |
| `religious` | string | max 100 |
| `hobby` | string | max 300 |
| `relationStatus` | string | max 100 |
| `dateOfBirth` | string | ISO date string |

**Response `200`** — Updated user object.

---

### `GET /api/users`

Search and list users (paginated).

**Query**

| Param | Type | Default |
|-------|------|---------|
| `search` | string | — |
| `page` | number | 1 |
| `limit` | number | 20 (max 50) |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "<objectId>",
        "name": "Jane",
        "email": "jane@example.com",
        "profilePicture": "https://...",
        "isOnline": false,
        "lastSeen": "2026-05-24T12:00:00.000Z",
        "relationship": { "status": "none" }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
  }
}
```

`relationship.status`: `"none"` | `"friends"` | `"pending_sent"` | `"pending_received"`

---

### `GET /api/users/:id`

Public profile for a user by MongoDB ObjectId.

**Response `200`** — User summary. **Errors:** `404` not found.

---

## Friend requests — `/api/friend-requests`

All routes require authentication.

### `POST /api/friend-requests`

Send a friend request.

**Body (JSON)**

```json
{ "receiverId": "<objectId>" }
```

**Response `201`**

---

### `GET /api/friend-requests/received`

Pending requests where the current user is the receiver.

---

### `GET /api/friend-requests/sent`

Pending requests sent by the current user.

---

### `GET /api/friend-requests/friends`

Accepted friends list.

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "<userId>",
      "name": "Friend Name",
      "email": "friend@example.com",
      "profilePicture": "https://...",
      "isOnline": true,
      "lastSeen": "2026-05-24T12:00:00.000Z"
    }
  ]
}
```

---

### `PATCH /api/friend-requests/:id/respond`

**Body (JSON)**

```json
{ "action": "accept" }
```

`action`: `"accept"` | `"reject"`

---

### `DELETE /api/friend-requests/:id`

Cancel a sent pending request (sender only).

---

## Messages — `/api/messages`

All routes require authentication. Real-time delivery also emits Socket.IO events (see [WebSocket](#websocket-events)).

### Message object

```json
{
  "id": "<objectId>",
  "senderId": "<objectId>",
  "receiverId": "<objectId>",
  "messageType": "text",
  "content": "Hello",
  "imageUrl": "",
  "voiceUrl": "",
  "voiceDuration": 0,
  "read": false,
  "isDeleted": false,
  "editedAt": null,
  "replyTo": {
    "id": "<objectId>",
    "senderId": "<objectId>",
    "content": "Original",
    "imageUrl": "",
    "voiceUrl": "",
    "isDeleted": false
  },
  "createdAt": "2026-05-24T12:00:00.000Z"
}
```

`messageType`: `"text"` | `"call"` (call logs include `callStatus`, `callDuration`, `callType`)

`callStatus`: `"completed"` | `"rejected"` | `"cancelled"` | `"missed"` | `"busy"` | `"disconnected"`

`callType`: `"audio"` | `"video"` (present on call logs; older logs without the field are treated as `"audio"`)

`delivered`: `boolean` — message reached the recipient (single tick). Set when the recipient's client acks via `message_delivered`, or swept on their next connect. Reading implies delivered.

`read`: `boolean` — recipient has seen the message (double tick).

---

### `POST /api/messages`

Send a message. Triggers `receive_message` on both participants' sockets.

**Content-Type:** `multipart/form-data`

| Field | Type | Rules |
|-------|------|-------|
| `receiverId` | string | MongoDB ObjectId |
| `content` | string | max 5000, optional |
| `replyToId` | string | optional ObjectId |
| `voiceDuration` | number | 0–60 seconds |
| `image` | file | max 10 MB |
| `voice` | file | audio, max 16 MB |

**Response `201`** — `{ success: true, data: <message> }`

---

### `GET /api/messages/:userId`

Paginated conversation with another user (must be friends).

**Query**

| Param | Type | Default |
|-------|------|---------|
| `page` | number | 1 |
| `limit` | number | 50 (max 100) |
| `before` | string | Message ObjectId — cursor for older messages |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "messages": [ ],
    "pagination": { "page", "limit", "hasMore" }
  }
}
```

---

### `PATCH /api/messages/read`

Mark all messages from a sender as read. Emits `messages_read` to the sender via socket.

**Body (JSON)**

```json
{ "senderId": "<objectId>" }
```

**Response `200`**

```json
{
  "success": true,
  "data": { "modifiedCount": 3 }
}
```

---

### `PATCH /api/messages/:id`

Edit a message (sender only). Emits `message_updated`.

**Content-Type:** `multipart/form-data` or JSON

| Field | Type |
|-------|------|
| `content` | string, optional |
| `image` | file, optional |
| `removeImage` | `"true"` \| `"false"` |

---

### `DELETE /api/messages/:id`

Soft-delete (sender only). Emits `message_deleted`.

---

## Chats — `/api/chats`

### `GET /api/chats`

🔒 Conversation list for the current user (friends only), sorted by recent activity.

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "user": { "id", "name", "profilePicture", "isOnline", "lastSeen" },
      "lastMessage": { "id", "content", "messageType", "senderId", "createdAt", "read" },
      "unreadCount": 2
    }
  ]
}
```

---

### `DELETE /api/chats/:userId`

Delete entire conversation with a friend. Emits `conversation_deleted` to both users.

`:userId` — the other participant's ObjectId.

---

## Posts — `/api/posts`

Social feed for friends. All routes require authentication.

### Post object

```json
{
  "id": "<objectId>",
  "author": { "id", "name", "profilePicture" },
  "content": "Post text",
  "imageUrl": "https://...",
  "likesCount": 0,
  "commentsCount": 0,
  "likedByMe": false,
  "createdAt": "2026-05-24T12:00:00.000Z",
  "updatedAt": "2026-05-24T12:00:00.000Z"
}
```

---

### `GET /api/posts`

Friend feed (paginated).

**Query:** `page` (default 1), `limit` (default 20, max 50)

---

### `POST /api/posts`

**Content-Type:** `multipart/form-data`

| Field | Type |
|-------|------|
| `content` | string, max 5000 |
| `image` | file, max 10 MB |

**Response `201`**

---

### `PATCH /api/posts/:id`

Update post (author only). Fields: `content`, `image`, `removeImage`.

---

### `DELETE /api/posts/:id`

Delete post (author only).

---

### `POST /api/posts/:id/like`

Toggle like. **Response `200`** — updated like state and count.

---

### `GET /api/posts/:id/comments`

**Query:** `page`, `limit` (max 100)

---

### `POST /api/posts/:id/comments`

**Body (JSON)**

```json
{ "content": "Nice post!" }
```

---

### `PATCH /api/posts/:id/comments/:commentId`

**Body (JSON)** — `{ "content": "Updated comment" }` (author only)

---

### `DELETE /api/posts/:id/comments/:commentId`

Delete comment (author only).

---

## Calls — `/api/calls`

Voice calls use **Socket.IO** for signaling and **ZEGOCLOUD** for media. REST endpoints supply RTC configuration and tokens.

All routes require authentication.

### `GET /api/calls/config`

ZEGOCLOUD client configuration.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "appId": 123456789,
    "serverUrl": "wss://webliveroom-api.zego.im/ws"
  }
}
```

---

### `POST /api/calls/token`

Mint a short-lived RTC token for a room.

**Body (JSON)**

```json
{ "roomId": "room_abc123" }
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "token": "<zego-token>",
    "roomId": "room_abc123",
    "appId": 123456789,
    "serverUrl": "wss://webliveroom-api.zego.im/ws",
    "userId": "<currentUserId>"
  }
}
```

---

## Admin — `/api/admin`

Staff-only moderation and analytics. **Every route requires `authenticate` + staff role** (`moderator` or `admin`); routes noted as **admin-only** additionally require the `admin` role. Role/status are re-checked against the database on each request.

This surface is **privacy-safe by design**: it exposes aggregate counts and metadata, lets staff moderate **public** content (posts/comments/profiles), and acts on private content **only via the reports queue** — message **bodies are never returned**.

### `GET /api/admin/stats`

Dashboard metrics (last-14-day series included).

**Response `200`**

```json
{
  "success": true,
  "data": {
    "users": { "total": 0, "active": 0, "suspended": 0, "banned": 0, "onlineNow": 0, "newToday": 0, "newThisWeek": 0 },
    "content": { "postsTotal": 0, "postsToday": 0, "commentsToday": 0 },
    "messaging": { "messagesToday": 0, "callsToday": 0 },
    "reports": { "open": 0, "resolvedToday": 0 },
    "series": {
      "signups": [{ "date": "2026-05-24", "count": 0 }],
      "messages": [{ "date": "2026-05-24", "count": 0 }]
    }
  }
}
```

---

### `GET /api/admin/health`

Live system health.

**Response `200`**

```json
{
  "success": true,
  "data": { "socketConnections": 0, "apiOk": true, "dbOk": true, "uptimeSeconds": 0, "presenceCount": 0 }
}
```

---

### `GET /api/admin/users`

Paginated user list with moderation counters.

**Query**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `search` | string | — | Matches name or email |
| `status` | string | `all` | `all` \| `active` \| `suspended` \| `banned` |
| `role` | string | `all` | `all` \| `user` \| `moderator` \| `admin` |
| `page` | number | 1 | |
| `limit` | number | 12 | max 100 |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "<objectId>",
        "name": "Jane",
        "email": "jane@example.com",
        "profilePicture": "https://...",
        "role": "user",
        "status": "active",
        "isOnline": false,
        "lastSeen": "2026-05-24T12:00:00.000Z",
        "createdAt": "2026-05-24T12:00:00.000Z",
        "postsCount": 0,
        "reportsAgainst": 0
      }
    ],
    "pagination": { "page": 1, "limit": 12, "total": 0, "totalPages": 1 }
  }
}
```

---

### `PATCH /api/admin/users/:id`

Update a user's `status` and/or `role`. Suspending or banning disconnects the user's live sockets and busts their cache immediately.

**Body (JSON)** — at least one of `status` / `role` is required.

| Field | Type | Notes |
|-------|------|-------|
| `status` | string | `active` \| `suspended` \| `banned` |
| `role` | string | `user` \| `moderator` \| `admin` — **admin-only** |
| `suspendedUntil` | string | ISO date; applied when `status` is `suspended` |

**Response `200`** — `{ success, data: { id, role, status } }`

**Errors:** `400` updating own status to non-active · `403` non-admin changing roles or acting on another admin · `404` user not found

---

### `POST /api/admin/users/:id/force-logout`

Disconnect a user's live sockets and mark them offline (does not change their role/status).

**Response `200`** — `{ success, data: { success: true } }`

---

### `GET /api/admin/posts`

Paginated posts with report counts (for moderation).

**Query:** `search`, `reportedOnly` (`true`/`false`, default `false`), `page` (1), `limit` (12, max 100)

**Response `200`**

```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "id": "<objectId>",
        "content": "Post text",
        "imageUrl": "https://...",
        "author": { "id": "<objectId>", "name": "Jane", "profilePicture": "https://..." },
        "likesCount": 0,
        "commentsCount": 0,
        "reportsCount": 0,
        "hidden": false,
        "createdAt": "2026-05-24T12:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 12, "total": 0, "totalPages": 1 }
  }
}
```

`hidden` posts are excluded from the public feed but remain visible to staff.

---

### `PATCH /api/admin/posts/:id`

Hide or unhide a post. **Body:** `{ "hidden": true }`. **Response `200`** — `{ success, data: { id, hidden } }`

---

### `DELETE /api/admin/posts/:id`

**Admin-only.** Permanently deletes a post plus its likes, comments, and S3 image. **Response `200`** — `{ success, data: { success: true } }`

---

### `GET /api/admin/reports`

Moderation queue. **Query:** `status` (`all` | `open` | `resolved` | `dismissed`, default `open`), `page` (1), `limit` (12).

**Response `200`**

```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "id": "<objectId>",
        "reporter": { "id": "<objectId>", "name": "Jane", "profilePicture": "https://..." },
        "targetType": "post",
        "targetId": "<id>",
        "targetPreview": "First 140 chars of the post…",
        "reason": "spam",
        "note": "optional reporter note",
        "status": "open",
        "createdAt": "2026-05-24T12:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 12, "total": 0, "totalPages": 1 }
  }
}
```

`targetType`: `post` | `comment` | `user` | `message`. For `message` targets, `targetPreview` is a fixed placeholder — **message content is never exposed**.

---

### `PATCH /api/admin/reports/:id`

Resolve or dismiss a report. **Body:** `{ "status": "resolved" | "dismissed", "action"?: "content_removed" }`. **Response `200`** — `{ success, data: { id, status } }`

---

### `GET /api/admin/audit`

Append-only log of every privileged action (bans, deletes, role changes, report resolutions). **Query:** `page` (1), `limit` (12).

**Response `200`**

```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": "<objectId>",
        "actor": { "id": "<objectId>", "name": "Admin" },
        "action": "user.banned",
        "targetType": "user",
        "targetId": "<id>",
        "targetLabel": "Jane Doe",
        "metadata": { "name": "Jane Doe" },
        "createdAt": "2026-05-24T12:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 12, "total": 0, "totalPages": 1 }
  }
}
```

---

## Reports — `/api/reports`

The privacy-safe way for any user to flag content for staff review (the substitute for staff reading private inboxes).

### `POST /api/reports`

🔒 Authenticated (any user).

**Body (JSON)**

| Field | Type | Rules |
|-------|------|-------|
| `targetType` | string | `post` \| `comment` \| `user` \| `message` |
| `targetId` | string | 1–100 chars |
| `reason` | string | 2–200 chars |
| `note` | string | optional, max 1000 |

**Response `201`** — `{ success, data: { id, status: "open" } }`

---

## WebSocket events

**URL:** Same host as HTTP (e.g. `http://localhost:5001`)

**Auth (required):**

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5001", {
  auth: { token: "<jwt>" },
  // or: extraHeaders: { Authorization: "Bearer <jwt>" }
});
```

On connect, the server joins the socket to room `user:{userId}`.

### Client → Server

| Event | Payload | Ack callback | Rate limit |
|-------|---------|--------------|------------|
| `send_message` | `{ receiverId, content, replyToId? }` | `{ success, data?, message? }` | 60/min |
| `message_read` | `{ senderId }` | — | 120/min |
| `message_delivered` | `{ senderId }` | — | 120/min |
| `typing` | `{ receiverId, isTyping }` | — | 120/min |
| `call:invite` | `{ calleeId, callType? }` | `{ success, data?, message? }` | 20/min |
| `call:accept` | `{ callId }` | `{ success, data?, message? }` | — |
| `call:reject` | `{ callId }` | — | — |
| `call:cancel` | `{ callId }` | — | — |
| `call:end` | `{ callId }` | — | — |

`send_message` does not support file uploads — use `POST /api/messages` for images/voice.

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `receive_message` | Message object | New message (REST or socket) |
| `message_updated` | Message object | Message edited |
| `message_deleted` | Message object | Message soft-deleted |
| `messages_read` | `{ readerId, modifiedCount }` | Peer read your messages (double tick) |
| `messages_delivered` | `{ receiverId }` | Your messages reached the peer (single tick) |
| `typing` | `{ userId, isTyping }` | Typing indicator |
| `user_presence` | `{ userId, isOnline, lastSeen? }` | Friend online/offline |
| `conversation_deleted` | `{ otherUserId }` | Thread removed |
| `call:incoming` | `{ callId, roomId, callerId, callerName, callType }` | Incoming call |
| `call:accepted` | `{ callId, roomId, callType }` | Callee accepted |
| `call:ended` | `{ callId, reason, duration }` | Call finished |

**Call types** — `callType` is `"audio"` or `"video"` (defaults to `"audio"` when omitted, so existing clients keep working). The same room/token serves both; the value tells the client whether to publish a camera stream. Call-log messages persist `callType`, so chat history shows whether a call was audio or video.

**Call flow (simplified)**

1. Caller emits `call:invite` (with `callType`) → callee receives `call:incoming` carrying that `callType`
2. Callee emits `call:accept` → both receive `call:accepted` with `roomId` and `callType`
3. Both call `POST /api/calls/token` with `roomId` and join ZEGOCLOUD (publish camera + mic for video, mic only for audio)
4. Either party emits `call:end` or disconnects → `call:ended` + call log message in chat (tagged with `callType`)

Ring timeout: **45 seconds** (missed call). Disconnect grace during active call: **15 seconds**.

---

## HTTP status codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Validation / bad request |
| 401 | Missing or invalid auth |
| 403 | Authenticated but not permitted (suspended/banned account, or insufficient role) |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email) |
| 429 | Rate limit exceeded |
| 500 | Server error |

---

## Static uploads

Local fallback (development): `GET /uploads/*` serves files from `UPLOAD_DIR` (default `uploads/`).

Production media is served from **S3 URLs** returned in API responses.

---

## Example: login and send a message

```bash
# Register
curl -s -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret12"}'

# Login (save token)
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret12"}' \
  | jq -r '.data.token')

# Send text message
curl -s -X POST http://localhost:5001/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"receiverId":"<friendObjectId>","content":"Hello!"}'
```

---

## Postman / OpenAPI

This reference is maintained manually from the TypeScript route and validation definitions under `src/modules/`. For interactive testing, import the endpoints above into Postman or generate a collection from `docs/API.md`.
