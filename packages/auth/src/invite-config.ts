const DAY_MS = 24 * 60 * 60 * 1000;

const TTL_DAYS = 7;

export const INVITES = {
	header: "x-navirex-invite",
	ttlDays: TTL_DAYS,
	ttlMs: TTL_DAYS * DAY_MS,
	tokenBytes: 32,
} as const;

export const INVITABLE_ROLES = ["admin", "manager", "member"] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];
