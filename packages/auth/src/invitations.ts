import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { INVITABLE_ROLES, INVITES, type InvitableRole } from "./invite-config";

export { INVITABLE_ROLES, INVITES, type InvitableRole };

export const INVITE_STATUS = {
	pending: "pending",
	accepted: "accepted",
	canceled: "canceled",
} as const;

export class NotInvitedError extends Error {
	constructor() {
		super(
			"This CRM is invite-only. Ask a Founder or Superadmin to invite your email address.",
		);
		this.name = "NotInvitedError";
	}
}

export function newInviteToken(): { token: string; id: string } {
	const token = randomBytes(INVITES.tokenBytes).toString("base64url");
	return { token, id: inviteIdOf(token) };
}

export function inviteIdOf(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function isInvitableRole(value: string | null): value is InvitableRole {
	return (INVITABLE_ROLES as readonly string[]).includes(value ?? "");
}

type InvitationReader = Pick<Db, "invitation">;

const livePending = () => ({
	organizationId: WORKSPACE_ID,
	status: INVITE_STATUS.pending,
	expiresAt: { gt: new Date() },
});

export async function invitationForToken(
	token: string | null | undefined,
	client: InvitationReader,
) {
	const value = token?.trim();
	if (!value) return null;
	return client.invitation.findFirst({
		where: { id: inviteIdOf(value), ...livePending() },
		select: { id: true, email: true, role: true, expiresAt: true },
	});
}

export async function pendingInvitationFor(
	email: string | null | undefined,
	client: InvitationReader,
) {
	const value = email?.trim().toLowerCase();
	if (!value) return null;
	return client.invitation.findFirst({
		where: {
			email: { equals: value, mode: "insensitive" },
			...livePending(),
		},
		select: { id: true, email: true, role: true },
		orderBy: { createdAt: "desc" },
	});
}
