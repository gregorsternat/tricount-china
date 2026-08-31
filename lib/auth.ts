import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";

import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  getAuthBaseUrl,
  getAuthSecret,
  getTrustedAuthOrigins,
} from "@/lib/server/env";
import {
  authorizePrivateSignup,
  claimInvitationForUser,
} from "@/lib/server/invitations";

const baseURL = getAuthBaseUrl();

export const auth = betterAuth({
  appName: "Fen",
  baseURL,
  basePath: "/api/auth",
  secret: getAuthSecret(),
  trustedOrigins: getTrustedAuthOrigins(baseURL),
  database: drizzleAdapter(getDb(), {
    provider: "sqlite",
    schema,
    usePlural: true,
    transaction: false,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      preferredCurrency: {
        type: "string",
        required: false,
        defaultValue: "CNY",
      },
      timezone: {
        type: "string",
        required: false,
        defaultValue: "Asia/Shanghai",
      },
      locale: {
        type: "string",
        required: false,
        defaultValue: "fr",
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60 * 10, max: 5 },
      "/forget-password": { window: 60 * 10, max: 3 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== "/sign-up/email") return;

      const email = context.body?.email;
      const invitationToken = context.body?.invitationToken;
      if (
        typeof email !== "string" ||
        (invitationToken !== undefined && typeof invitationToken !== "string")
      ) {
        throw APIError.from("BAD_REQUEST", {
          code: "INVALID_SIGNUP_REQUEST",
          message: "Invalid sign-up request.",
        });
      }

      const authorization = await authorizePrivateSignup({
        email,
        ...(invitationToken ? { invitationToken } : {}),
      });

      if (!authorization) {
        throw APIError.from("FORBIDDEN", {
          code: "INVITATION_REQUIRED",
          message: "A valid invitation is required to create an account.",
        });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          if (context?.path !== "/sign-up/email") return;

          try {
            const invitationToken = context.body?.invitationToken;
            if (typeof invitationToken === "string") {
              await claimInvitationForUser(user.id, user.email, invitationToken);
            }
          } catch (error) {
            // D1 does not expose interactive transactions. Account creation must
            // not be reported as failed after Better Auth has persisted it; the
            // client retries this exact-token reconciliation through the claim API.
            console.error("Failed to claim invitations after sign-up", error);
          }
        },
      },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    database: {
      generateId: "uuid",
      joins: false,
    },
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
