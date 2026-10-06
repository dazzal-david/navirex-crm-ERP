import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CommunicationsService } from "../src/communications/communications.service";
import { WhatsAppWebhookService } from "../src/communications/whatsapp-webhook.service";
import { leadUpdateInput, zohoLeadRow } from "../src/leads/leads.contracts";
import { LeadsService } from "../src/leads/leads.service";
import { templateUpdateInput } from "../src/templates/templates.contracts";

const suffix = crypto.randomUUID();
const userId = `notes-user-${suffix}`;
const otherId = `notes-other-${suffix}`;
const MINUTE_MS = 60_000;

const leads = new LeadsService(db, new AgentTriggerService(db));
const communications = new CommunicationsService(
	db,
	{} as never,
	{} as never,
	{ get: () => undefined } as never,
);
const webhook = new WhatsAppWebhookService(db, leads, {
	get: () => undefined,
} as never);

async function customerLead(name: string) {
	return leads.create(
		{
			name: `${name} ${suffix}`,
			kind: "CUSTOMER",
			stage: "FOLLOW_UP",
			ownerId: userId,
		},
		userId,
	);
}

async function inbound(leadId: string, minutesAgo: number) {
	await db.activity.create({
		data: {
			type: ActivityType.NOTE,
			subject: "WhatsApp message",
			body: "Hello",
			leadId,
			createdById: userId,
			occurredAt: new Date(Date.now() - minutesAgo * MINUTE_MS),
			meta: { channel: "whatsapp", direction: "inbound" },
		},
	});
}

beforeAll(async () => {
	const joined = new Date(Date.now() - 60 * MINUTE_MS);
	await db.user.createMany({
		data: [
			{
				id: userId,
				name: "Notes Rep",
				email: `${userId}@example.test`,
				createdAt: joined,
			},
			{
				id: otherId,
				name: "Other Rep",
				email: `${otherId}@example.test`,
				createdAt: joined,
			},
		],
	});
});

afterAll(async () => {
	await db.agentTask.deleteMany({
		where: { kind: "agent-event", reason: "lead.created" },
	});
	await db.activity.deleteMany({
		where: { createdById: { in: [userId, otherId] } },
	});
	await db.lead.deleteMany({ where: { name: { endsWith: suffix } } });
	await db.lead.deleteMany({ where: { phone: "+919000000001" } });
	await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

describe("partial updates", () => {
	it("send no status or category when only one field changes", () => {
		const parsed = leadUpdateInput.parse({ id: "lead", phone: "123" });

		expect(parsed).toEqual({ id: "lead", phone: "123" });
	});

	it("leave a Zoho row's status and category unset when the export has none", () => {
		const parsed = zohoLeadRow.parse({ zohoId: "z1", name: "Row" });

		expect(parsed.stage).toBeUndefined();
		expect(parsed.kind).toBeUndefined();
	});

	it("keep a template's language when only the active flag changes", () => {
		const parsed = templateUpdateInput.parse({ id: "t1", active: false });

		expect(parsed.language).toBeUndefined();
	});

	it("keep the status and category of a lead whose phone is edited", async () => {
		const lead = await customerLead("Keeps status");
		const input = leadUpdateInput.parse({ id: lead.id, phone: "+91 98 7654" });

		const updated = await leads.update(input, userId);

		expect(updated.stage).toBe("FOLLOW_UP");
		expect(updated.kind).toBe("CUSTOMER");
		expect(updated.phone).toBe("+91 98 7654");
	});
});

describe("lead history", () => {
	it("writes no entry for a field edit", async () => {
		const lead = await customerLead("Quiet edit");

		await leads.update({ id: lead.id, website: "navirex.in" }, userId);

		const entries = await db.activity.findMany({
			where: { leadId: lead.id },
			select: { type: true, body: true },
		});
		expect(entries).toEqual([
			{ type: ActivityType.STAGE_CHANGE, body: "Lead created in Follow-up." },
		]);
	});

	it("records a status change from the lead sheet with readable labels", async () => {
		const lead = await customerLead("Sheet move");

		await leads.update({ id: lead.id, stage: "ONBOARDED" }, userId);

		const change = await db.activity.findFirst({
			where: { leadId: lead.id, body: { startsWith: "Stage changed" } },
			select: { type: true, body: true },
		});
		expect(change).toEqual({
			type: ActivityType.STAGE_CHANGE,
			body: "Stage changed Follow-up → Onboarded.",
		});
	});

	it("keeps system events out of the conversation", async () => {
		const lead = await customerLead("No system noise");
		await leads.assign(lead.id, otherId, userId);

		const conversation = await communications.conversation(lead.id);

		expect(conversation.items).toHaveLength(0);
	});
});

describe("lead notes", () => {
	it("lists every note newest first with its author and time", async () => {
		const lead = await customerLead("Many notes");
		await communications.addNote(
			{ leadId: lead.id, body: "First call" },
			userId,
		);
		await communications.addNote(
			{ leadId: lead.id, body: "Sent brochure" },
			otherId,
		);

		const notes = await communications.notes(lead.id);

		expect(notes.map((note) => note.body)).toEqual([
			"Sent brochure",
			"First call",
		]);
		expect(notes[0]?.authorName).toBe("Other Rep");
		expect(notes[0]?.occurredAt).toBeInstanceOf(Date);
	});

	it("shows the same notes in the conversation", async () => {
		const lead = await customerLead("Shared notes");
		await communications.addNote(
			{ leadId: lead.id, body: "Visited site" },
			userId,
		);

		const conversation = await communications.conversation(lead.id);

		expect(conversation.items.map((item) => [item.channel, item.body])).toEqual(
			[["note", "Visited site"]],
		);
	});

	it("turns notes sent with a new lead into a note entry", async () => {
		const created = await leads.intake(
			{
				name: `Website ${suffix}`,
				email: `web-${suffix}@example.test`,
				kind: "OTHER",
				stage: "NOT_CONTACTED",
				source: "Website",
				notes: "Please call me about solar MRV",
			},
			userId,
		);

		const notes = await communications.notes(created.id);
		const lead = await db.lead.findUniqueOrThrow({
			where: { id: created.id },
			select: { notes: true },
		});

		expect(notes.map((note) => note.body)).toEqual([
			"Please call me about solar MRV",
		]);
		expect(lead.notes).toBeNull();
	});

	it("keeps a repeat enquiry's message as a new note", async () => {
		const email = `repeat-${suffix}@example.test`;
		const first = await leads.intake(
			{
				name: `Repeat ${suffix}`,
				email,
				kind: "OTHER",
				stage: "NOT_CONTACTED",
			},
			userId,
		);
		const second = await leads.intake(
			{
				name: `Repeat ${suffix}`,
				email,
				kind: "OTHER",
				stage: "NOT_CONTACTED",
				notes: "Following up on my request",
			},
			userId,
		);

		expect(second).toEqual({ id: first.id, created: false });
		expect(
			(await communications.notes(first.id)).map((note) => note.body),
		).toEqual(["Following up on my request"]);
	});

	it("leaves WhatsApp messages out of the notes", async () => {
		const lead = await customerLead("WhatsApp only");
		await inbound(lead.id, 5);

		expect(await communications.notes(lead.id)).toEqual([]);
	});
});

describe("unread WhatsApp conversations", () => {
	it("counts a conversation with an inbound message once per reader", async () => {
		const before = (await communications.unread(userId)).conversations;
		const lead = await customerLead("Unread");
		await inbound(lead.id, 2);
		await inbound(lead.id, 1);

		const list = await communications.conversations(userId);

		expect((await communications.unread(userId)).conversations).toBe(
			before + 1,
		);
		expect(list.find((row) => row.id === lead.id)?.unread).toBe(2);
	});

	it("clears for the reader who opens it and stays for everyone else", async () => {
		const lead = await customerLead("Read by one");
		await inbound(lead.id, 1);
		const otherBefore = (await communications.unread(otherId)).conversations;

		await communications.markRead(lead.id, userId);

		const mine = await communications.conversations(userId);
		const theirs = await communications.conversations(otherId);
		expect(mine.find((row) => row.id === lead.id)?.unread).toBe(0);
		expect(theirs.find((row) => row.id === lead.id)?.unread).toBe(1);
		expect((await communications.unread(otherId)).conversations).toBe(
			otherBefore,
		);
	});

	it("ignores messages from before the reader joined", async () => {
		const lead = await customerLead("Old message");
		await inbound(lead.id, 120);

		const list = await communications.conversations(userId);

		expect(list.find((row) => row.id === lead.id)?.unread).toBe(0);
	});
});

describe("WhatsApp messages sent from the phone app", () => {
	it("are stored as outbound messages on the lead", async () => {
		await webhook.receive({
			object: "whatsapp_business_account",
			entry: [
				{
					id: `waba-${suffix}`,
					changes: [
						{
							field: "smb_message_echoes",
							value: {
								message_echoes: [
									{
										from: "919000000000",
										to: "919000000001",
										id: `wamid.echo.${suffix}`,
										timestamp: String(Math.floor(Date.now() / 1000)),
										type: "text",
										text: { body: "Sent from the phone" },
									},
								],
							},
						},
					],
				},
			],
		});

		const activity = await db.activity.findUniqueOrThrow({
			where: { id: `whatsapp:wamid.echo.${suffix}` },
			select: { leadId: true },
		});
		const conversation = await communications.conversation(
			activity.leadId ?? "",
		);

		expect(
			conversation.items.map((item) => [item.direction, item.body]),
		).toEqual([["outbound", "Sent from the phone"]]);
	});
});
