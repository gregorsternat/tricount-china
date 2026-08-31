import { type DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));

import type { AppDatabase } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  createMigratedSqliteDatabase,
  SqliteD1Database,
  type SqliteD1Statement,
} from "@/lib/test/sqlite-d1";

import { claimInvitationForUser, createPrivateInvitation } from "./invitations";
import { hashInvitationToken } from "./private-signup-policy";

const NOW = new Date("2026-09-02T08:00:00+08:00");
const INVITATION_TOKEN = "i".repeat(48);
const INVITER_ID = "user-inviter";
const USER_ID = "user-invitee";
const USER_EMAIL = "friend@example.com";
const GROUP_ID = "group-china";
const INVITATION_ID = "invitation-friend";
const NEW_INVITEE_EMAIL = "new-friend@example.com";

class TwoRequestBatchBarrier extends SqliteD1Database {
  private arrivals = 0;
  private releaseBarrier!: () => void;
  private readonly barrier = new Promise<void>((resolve) => {
    this.releaseBarrier = resolve;
  });
  private batchTail = Promise.resolve();

  override async batch(statements: SqliteD1Statement[]) {
    this.arrivals += 1;
    if (this.arrivals === 2) this.releaseBarrier();
    await this.barrier;

    const previousBatch = this.batchTail;
    let releaseBatch!: () => void;
    this.batchTail = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    await previousBatch;

    try {
      return await super.batch(statements);
    } finally {
      releaseBatch();
    }
  }
}

describe("claimInvitationForUser", () => {
  let sqlite: DatabaseSync;
  let d1: SqliteD1Database;
  let database: AppDatabase;

  beforeEach(async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-auth-secret-that-is-at-least-32-characters");
    vi.stubEnv("PRIVATE_SIGNUP_EMAILS", "");
    vi.stubEnv("PRIVATE_SIGNUP_BOOTSTRAP_TOKEN", "");
    sqlite = createMigratedSqliteDatabase();
    d1 = new SqliteD1Database(sqlite);
    database = drizzle(d1 as unknown as D1Database, {
      schema,
    }) as AppDatabase;

    sqlite
      .prepare(
        "insert into users (id, name, email, email_verified) values (?, ?, ?, ?), (?, ?, ?, ?)",
      )
      .run(
        INVITER_ID,
        "Inviter",
        "inviter@example.com",
        1,
        USER_ID,
        "Friend",
        USER_EMAIL,
        1,
      );
    sqlite
      .prepare("insert into groups (id, owner_user_id, name) values (?, ?, ?)")
      .run(GROUP_ID, INVITER_ID, "China 2026-2027");
    sqlite
      .prepare(
        `insert into invitations
          (id, group_id, inviter_user_id, invited_email, token_hash, role, status, expires_at)
         values (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        INVITATION_ID,
        GROUP_ID,
        INVITER_ID,
        USER_EMAIL,
        await hashInvitationToken(INVITATION_TOKEN),
        "member",
        NOW.getTime() + 60_000,
      );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    sqlite.close();
  });

  it("does not create a membership when the invitation is revoked immediately before the atomic write", async () => {
    d1.beforeNextBatch(() => {
      sqlite
        .prepare(
          "update invitations set status = 'revoked', revoked_at = ? where id = ?",
        )
        .run(NOW.getTime(), INVITATION_ID);
    });

    await expect(
      claimInvitationForUser(
        USER_ID,
        USER_EMAIL,
        INVITATION_TOKEN,
        database,
        NOW,
      ),
    ).rejects.toMatchObject({
      status: 410,
      code: "INVITATION_REVOKED",
    });

    expect(
      sqlite
        .prepare(
          "select count(*) as count from group_members where group_id = ? and user_id = ?",
        )
        .get(GROUP_ID, USER_ID),
    ).toEqual({ count: 0 });
    expect(
      sqlite
        .prepare(
          "select status, accepted_by_user_id from invitations where id = ?",
        )
        .get(INVITATION_ID),
    ).toEqual({ status: "revoked", accepted_by_user_id: null });
  });

  it("accepts once and reactivates an existing membership without changing its role", async () => {
    sqlite
      .prepare(
        `insert into group_members
          (id, group_id, user_id, role, status, left_at)
         values (?, ?, ?, 'admin', 'left', ?)`,
      )
      .run("membership-existing", GROUP_ID, USER_ID, NOW.getTime() - 60_000);

    await expect(
      claimInvitationForUser(
        USER_ID,
        USER_EMAIL,
        INVITATION_TOKEN,
        database,
        NOW,
      ),
    ).resolves.toEqual({
      status: "claimed",
      invitationId: INVITATION_ID,
      groupId: GROUP_ID,
    });

    expect(
      sqlite
        .prepare(
          "select role, status, left_at from group_members where group_id = ? and user_id = ?",
        )
        .get(GROUP_ID, USER_ID),
    ).toEqual({ role: "admin", status: "active", left_at: null });
    expect(
      sqlite
        .prepare(
          "select status, accepted_by_user_id from invitations where id = ?",
        )
        .get(INVITATION_ID),
    ).toEqual({ status: "accepted", accepted_by_user_id: USER_ID });

    await expect(
      claimInvitationForUser(
        USER_ID,
        USER_EMAIL,
        INVITATION_TOKEN,
        database,
        NOW,
      ),
    ).resolves.toEqual({
      status: "already_claimed",
      invitationId: INVITATION_ID,
      groupId: GROUP_ID,
    });
  });

  it("returns not found for a token that has no invitation", async () => {
    await expect(
      claimInvitationForUser(
        USER_ID,
        USER_EMAIL,
        "x".repeat(48),
        database,
        NOW,
      ),
    ).rejects.toMatchObject({
      status: 404,
      code: "INVITATION_NOT_FOUND",
    });
  });

  it("returns a conflict when the invitation email differs", async () => {
    await expect(
      claimInvitationForUser(
        USER_ID,
        "someone-else@example.com",
        INVITATION_TOKEN,
        database,
        NOW,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "INVITATION_EMAIL_MISMATCH",
    });
  });

  it("returns a conflict when another account already accepted the invitation", async () => {
    sqlite
      .prepare(
        "update invitations set status = 'accepted', accepted_by_user_id = ?, accepted_at = ? where id = ?",
      )
      .run(INVITER_ID, NOW.getTime(), INVITATION_ID);

    await expect(
      claimInvitationForUser(
        USER_ID,
        USER_EMAIL,
        INVITATION_TOKEN,
        database,
        NOW,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "INVITATION_ALREADY_CLAIMED",
    });
  });

  it("returns gone when the invitation has expired", async () => {
    sqlite
      .prepare("update invitations set expires_at = ? where id = ?")
      .run(NOW.getTime(), INVITATION_ID);

    await expect(
      claimInvitationForUser(
        USER_ID,
        USER_EMAIL,
        INVITATION_TOKEN,
        database,
        NOW,
      ),
    ).rejects.toMatchObject({
      status: 410,
      code: "INVITATION_EXPIRED",
    });
  });

  it("recognizes the private owner bootstrap token without pretending an invitation was claimed", async () => {
    const bootstrapToken = "b".repeat(48);
    vi.stubEnv("PRIVATE_SIGNUP_EMAILS", USER_EMAIL);
    vi.stubEnv("PRIVATE_SIGNUP_BOOTSTRAP_TOKEN", bootstrapToken);

    await expect(
      claimInvitationForUser(
        USER_ID,
        USER_EMAIL,
        bootstrapToken,
        database,
        NOW,
      ),
    ).resolves.toEqual({ status: "bootstrap_authorized" });
  });

  it("returns the same credential on retry without persisting the bearer token", async () => {
    const input = {
      groupId: GROUP_ID,
      inviterUserId: INVITER_ID,
      email: NEW_INVITEE_EMAIL,
      idempotencyKey: "invitation-retry-key",
    };

    const first = await createPrivateInvitation(input, database);
    const retry = await createPrivateInvitation(input, database);

    expect(retry).toEqual(first);
    expect(
      sqlite
        .prepare(
          "select count(*) as count from invitations where group_id = ? and invited_email = ?",
        )
        .get(GROUP_ID, NEW_INVITEE_EMAIL),
    ).toEqual({ count: 1 });
    const stored = sqlite
      .prepare(
        "select token_hash from invitations where group_id = ? and invited_email = ?",
      )
      .get(GROUP_ID, NEW_INVITEE_EMAIL);
    expect(JSON.stringify(stored)).not.toContain(first.token);
    expect(
      sqlite
        .prepare(
          "select count(*) as count from audit_logs where entity_id = ? and action = 'group.invitation_created'",
        )
        .get(first.invitationId),
    ).toEqual({ count: 1 });
  });

  it("coalesces simultaneous retries with the same idempotency key", async () => {
    const concurrentDatabase = drizzle(
      new TwoRequestBatchBarrier(sqlite) as unknown as D1Database,
      { schema },
    ) as AppDatabase;
    const input = {
      groupId: GROUP_ID,
      inviterUserId: INVITER_ID,
      email: NEW_INVITEE_EMAIL,
      idempotencyKey: "invitation-concurrent-retry",
    };

    const [first, second] = await Promise.all([
      createPrivateInvitation(input, concurrentDatabase),
      createPrivateInvitation(input, concurrentDatabase),
    ]);

    expect(second).toEqual(first);
    expect(
      sqlite
        .prepare(
          "select count(*) as count from invitations where group_id = ? and invited_email = ? and status = 'pending'",
        )
        .get(GROUP_ID, NEW_INVITEE_EMAIL),
    ).toEqual({ count: 1 });
  });

  it("keeps only the latest pending invitation under concurrent replacement", async () => {
    const concurrentDatabase = drizzle(
      new TwoRequestBatchBarrier(sqlite) as unknown as D1Database,
      { schema },
    ) as AppDatabase;

    const attempts = await Promise.all([
      createPrivateInvitation(
        {
          groupId: GROUP_ID,
          inviterUserId: INVITER_ID,
          email: NEW_INVITEE_EMAIL,
          idempotencyKey: "invitation-concurrent-a",
        },
        concurrentDatabase,
      ),
      createPrivateInvitation(
        {
          groupId: GROUP_ID,
          inviterUserId: INVITER_ID,
          email: NEW_INVITEE_EMAIL,
          idempotencyKey: "invitation-concurrent-b",
        },
        concurrentDatabase,
      ),
    ]);

    expect(attempts[0].invitationId).not.toBe(attempts[1].invitationId);
    expect(
      sqlite
        .prepare(
          `select
            sum(case when status = 'pending' then 1 else 0 end) as pending,
            sum(case when status = 'revoked' then 1 else 0 end) as revoked
           from invitations where group_id = ? and invited_email = ?`,
        )
        .get(GROUP_ID, NEW_INVITEE_EMAIL),
    ).toEqual({ pending: 1, revoked: 1 });
  });
});
