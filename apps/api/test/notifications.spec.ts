import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CommunicationsService } from "../src/communications/communications.service";
import { LeadsService } from "../src/leads/leads.service";
import { NotificationsService } from "../src/notifications/notifications.service";

const suffix = crypto.randomUUID();
const author = `notif-author-${suffix}`;
const arjun = `notif-arjun-${suffix}`;
const outsider = `notif-outsider-${suffix}`;

const sent: { to: string; subject: string }[] = [];
const notifications = new NotificationsService(db, {
	configured: true,
	send: async (to: string, subject: string) => {
		sent.push({ to, subject });
	},
} as never);
const leads = new LeadsService(db, new AgentTriggerService(db));
const communications = new CommunicationsService(
	db,
	{} as never,
	{} as never,
	{ get: () => undefined } as never,
);

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: "workspace" },
		create: {
			id: "workspace",
			name: "Navirex",
			slug: "navirex",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.user.createMany({
		data: [
			{ id: author, name: "Dazzal", email: `${author}@example.test` },
			{ id: arjun, name: "Arjun", email: `${arjun}@example.test` },
			{ id: outsider, name: "Gone", email: `${outsider}@example.test` },
		],
	});
	await db.member.createMany({
		data: [author, arjun].map((userId) => ({
			id: `member-${userId}`,
			organizationId: "workspace",
			userId,
			role: "member",
			createdAt: new Date(),
		})),
	});
});

afterAll(async () => {
	await db.notification.deleteMany({
		where: { userId: { in: [author, arjun, outsider] } },
	});
	await db.agentTask.deleteMany({
		where: {
			kind: "agent-event",
			reason: { in: ["lead.created", "company.created", "contact.created"] },
		},
	});
	await db.activity.deleteMany({ where: { createdById: author } });
	await db.lead.deleteMany({ where: { name: { endsWith: suffix } } });
	await db.contact.deleteMany({ where: { email: { endsWith: suffix } } });
	await db.company.deleteMany({ where: { name: { endsWith: suffix } } });
	await db.member.deleteMany({ where: { userId: { in: [author, arjun] } } });
	await db.user.deleteMany({
		where: { id: { in: [author, arjun, outsider] } },
	});
});

async function epc(name: string) {
	return leads.create(
		{
			name: `Silpa ${suffix}`,
			companyName: `${name} ${suffix}`,
			kind: "EPC",
			stage: "FOLLOW_UP",
		},
		author,
	);
}

describe("mentions", () => {
	it("notify and email members only, never the author or a non-member", async () => {
		const lead = await epc("Mention Co");
		const note = await communications.addNote(
			{
				leadId: lead.id,
				body: "@Arjun @Dazzal @Gone check",
				mentions: [arjun, author, outsider],
			},
			author,
		);
		const before = sent.length;

		const count = await notifications.notifyMentions({
			actorId: author,
			mentionIds: [arjun, author, outsider, arjun],
			leadId: lead.id,
			activityId: note.id,
			text: "@Arjun @Dazzal @Gone check",
		});

		expect(count).toBe(1);
		expect(sent.slice(before)).toEqual([
			{
				to: `${arjun}@example.test`,
				subject: `Dazzal mentioned you on Mention Co ${suffix}`,
			},
		]);
		expect((await notifications.unreadCount(arjun)).count).toBe(1);
		expect((await notifications.unreadCount(author)).count).toBe(0);
	});

	it("shows the mentioned names on the note", async () => {
		const lead = await epc("Names Co");
		await communications.addNote(
			{ leadId: lead.id, body: "@Arjun over to you", mentions: [arjun] },
			author,
		);

		const [note] = await communications.notes(lead.id);

		expect(note?.mentions).toEqual([{ id: arjun, name: "Arjun" }]);
	});

	it("marks one or all notifications read for their owner only", async () => {
		const [first] = await notifications.list(arjun);
		expect(first?.readAt).toBeNull();

		expect(await notifications.markRead(author, first?.id ?? "")).toEqual({
			updated: 0,
		});
		expect(await notifications.markRead(arjun, first?.id ?? "")).toEqual({
			updated: 1,
		});
		await notifications.markAllRead(arjun);

		expect((await notifications.unreadCount(arjun)).count).toBe(0);
	});
});

describe("converting with a handover note", () => {
	it("saves one note that shows on the lead and the new account", async () => {
		const lead = await epc("Handover Co");
		const result = await leads.convert(lead.id, author);

		const note = await leads.noteOnConversion(
			lead.id,
			result.companyId,
			"Onboarded. @Arjun start portal registration.",
			[arjun],
			author,
		);

		const stored = await db.activity.findUniqueOrThrow({
			where: { id: note.id },
			select: { leadId: true, companyId: true, body: true },
		});
		expect(stored).toEqual({
			leadId: lead.id,
			companyId: result.companyId,
			body: "Onboarded. @Arjun start portal registration.",
		});
		expect((await communications.notes(lead.id))[0]?.mentions).toEqual([
			{ id: arjun, name: "Arjun" },
		]);
	});
});
