import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { API_URL } from "@/lib/env";
import { InviteSignUp } from "./invite-sign-up";

export const metadata: Metadata = {
	title: "Accept invitation",
};

const invitationBody = z.object({
	email: z.string(),
	workspace: z.string().default("Navirex"),
});

type Invitation = z.infer<typeof invitationBody>;

type InviteParams = { params: Promise<{ token: string }> };

async function readInvitation(token: string): Promise<Invitation | null> {
	try {
		const response = await fetch(
			`${API_URL}/api/invitations/${encodeURIComponent(token)}`,
			{ cache: "no-store" },
		);
		if (!response.ok) return null;
		const body = invitationBody.safeParse(await response.json());
		return body.success ? body.data : null;
	} catch (error) {
		console.error("Invite: could not read the invitation.", error);
		return null;
	}
}

export default function InvitePage({ params }: InviteParams) {
	return (
		<AuthShell>
			<Suspense
				fallback={
					<AuthHeading
						title="Checking your invitation"
						description="One moment."
					/>
				}
			>
				<Invite params={params} />
			</Suspense>
		</AuthShell>
	);
}

async function Invite({ params }: InviteParams) {
	const { token } = await params;
	const invitation = await readInvitation(token);

	if (!invitation) {
		return (
			<AuthHeading
				title="This link does not work"
				description="The invitation is invalid, already used, or expired. Ask a Founder or Superadmin to send a new one."
			/>
		);
	}

	return (
		<>
			<AuthHeading
				title={`Join ${invitation.workspace} CRM`}
				description="Choose your name and a password to create your account."
			/>
			<InviteSignUp email={invitation.email} token={token} />
		</>
	);
}
