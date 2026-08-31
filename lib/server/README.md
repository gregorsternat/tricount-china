# Server configuration

The application expects a Cloudflare D1 binding named `DB` and the following
runtime variables:

- `BETTER_AUTH_SECRET` (required): a random secret of at least 32 characters.
  Store it with `wrangler secret put BETTER_AUTH_SECRET`; never commit it.
- `BETTER_AUTH_URL` (required in production): the public HTTPS origin, for
  example `https://fen.example.com`.
- `BETTER_AUTH_TRUSTED_ORIGINS` (optional): comma-separated additional origins
  that may call authenticated mutation endpoints. Keep this list as narrow as
  possible.
- `PRIVATE_SIGNUP_EMAILS` (optional): comma-, semicolon-, or newline-separated
  bootstrap email allowlist. An allowlisted address still needs the bootstrap
  token below; when omitted, new accounts require an active group invitation.
- `PRIVATE_SIGNUP_BOOTSTRAP_TOKEN` (required when `PRIVATE_SIGNUP_EMAILS` is
  used): a random token of at least 32 characters. Store it with
  `wrangler secret put PRIVATE_SIGNUP_BOOTSTRAP_TOKEN`, then privately open the
  owner link as `/join?token=<token>&email=<allowlisted-email>`. Never commit,
  log, or reuse this token as a password.

Invitation tokens are generated with 256 bits of randomness. Only their SHA-256
hash is stored. `inviteGroupMember` returns the raw token once so the caller can
build and privately share the `/join?token=...` URL; no email delivery provider
is configured by this backend.
