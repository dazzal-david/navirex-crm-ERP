import { INVITABLE_ROLES } from "@crm/auth";
import { z } from "zod";

export const invitationOutput = z.object({
	id: z.string(),
	email: z.string(),
	role: z.enum(INVITABLE_ROLES),
	expiresAt: z.string(),
	invitedBy: z.string(),
});

export const invitationsOutput = z.array(invitationOutput);

export const inviteInput = z.object({
	email: z.email().trim().toLowerCase().max(320),
	role: z.enum(INVITABLE_ROLES).default("member"),
});

export const inviteOutput = invitationOutput.extend({
	link: z.string(),
	emailed: z.boolean(),
});

export const invitationIdInput = z.object({ id: z.string().min(1) });

export const removeMemberInput = z.object({ memberId: z.string().min(1) });

export const removeMemberOutput = z.object({ removed: z.literal(true) });

export const invitationLookupOutput = z.object({
	email: z.string(),
	workspace: z.string(),
	expiresAt: z.string(),
});

export type Invitation = z.infer<typeof invitationOutput>;
export type InviteInput = z.infer<typeof inviteInput>;
export type InviteOutput = z.infer<typeof inviteOutput>;
export type InvitationLookup = z.infer<typeof invitationLookupOutput>;
