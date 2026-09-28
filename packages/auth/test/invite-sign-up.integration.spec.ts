import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";

process.env.API_URL = "https://crm.example.test";

const { auth } = await import("../src/auth");
const { env } = await import("../src/env");
const { INVITE_STATUS, INVITES, newInviteToken } = await import(
	"../src/invitations"
);
const { WORKSPACE_ID } = await import("../src/organization");

const suffix = process.env.TEST_RUN_ID ?? "invite-sign-up-spec";
const emailOf = (label: string) => `${label}.${suffix}@example.test`;
const PASSWORD = "correct-horse-battery";

let inviterId: string;
let caller = 0;

const signUp = (email: string, token?: string) => {
	const headers = new Headers({
		"content-type": "application/json",
		origin: env.apiUrl,
		"x-forwarded-for": `10.0.0.${++caller}`,
	});
	if (token) headers.set(INVITES.header, token);
	return auth.handler(
		new Request(new URL("/api/auth/sign-up/email", env.apiUrl), {
			method: "POST",
			headers,
			body: JSON.stringify({ email, password: PASSWORD, name: email }),
		}),
	);
};

const invite = async (label: string, role = "member") => {
	const { token, id } = newInviteToken();
	await db.invitation.create({
		data: {
			id,
			organizationId: WORKSPACE_ID,
			email: emailOf(label),
			role,
			status: INVITE_STATUS.pending,
			expiresAt: new Date(Date.now() + INVITES.ttlMs),
			inviterId,
		},
	});
	return token;
};

const clear = async () => {
	await db.invitation.deleteMany({
		where: { email: { endsWith: `.${suffix}@example.test` } },
	});
	await db.user.deleteMany({
		where: { email: { endsWith: `.${suffix}@example.test` } },
	});
};

beforeAll(async () => {
	await clear();
	const inviter = await db.user.create({
		data: {
			id: `${suffix}-inviter`,
			name: "Inviter",
			email: emailOf("inviter"),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		select: { id: true },
	});
	inviterId = inviter.id;
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "Navirex",
			slug: "navirex",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.member.upsert({
		where: {
			organizationId_userId: {
				organizationId: WORKSPACE_ID,
				userId: inviterId,
			},
		},
		create: {
			id: `${suffix}-inviter-member`,
			organizationId: WORKSPACE_ID,
			userId: inviterId,
			role: "owner",
			createdAt: new Date(),
		},
		update: {},
	});
});

afterAll(async () => {
	await db.member.deleteMany({
		where: { userId: { startsWith: `${suffix}-` } },
	});
	await db.member.deleteMany({
		where: { user: { email: { endsWith: `.${suffix}@example.test` } } },
	});
	await clear();
});

describe("password sign-up is invite-only", () => {
	it("refuses a sign-up with no invitation", async () => {
		const response = await signUp(emailOf("stranger"));

		expect(response.status).toBe(403);
		expect(await db.user.count({ where: { email: emailOf("stranger") } })).toBe(
			0,
		);
	});

	it("refuses a sign-up for an invited address without the link", async () => {
		await invite("nolink");

		const response = await signUp(emailOf("nolink"));

		expect(response.status).toBe(403);
	});

	it("refuses a link used for a different address", async () => {
		const token = await invite("owner-of-link");

		const response = await signUp(emailOf("thief"), token);

		expect(response.status).toBe(403);
		expect(await db.user.count({ where: { email: emailOf("thief") } })).toBe(0);
	});

	it("creates the account and membership from a valid link, once", async () => {
		const token = await invite("invitee", "manager");

		const response = await signUp(emailOf("invitee"), token);

		expect(response.status).toBe(200);
		const member = await db.member.findFirst({
			where: { user: { email: emailOf("invitee") } },
			select: { role: true },
		});
		expect(member?.role).toBe("manager");

		const again = await signUp(emailOf("invitee"), token);
		expect(again.status).not.toBe(200);
	});
});
