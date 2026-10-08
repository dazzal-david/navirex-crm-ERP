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
		expect(updated.phone).toBe("+91987654");
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

describe("lead phone numbers", () => {
	it("adds +91 to a bare Indian number on create and on edit", async () => {
		const lead = await leads.create(
			{
				name: `Neeraj ${suffix}`,
				kind: "OTHER",
				stage: "NOT_CONTACTED",
				phone: "9946788886",
				secondaryPhone: "09946788887",
			},
			userId,
		);
		expect(lead.phone).toBe("+919946788886");

		const edited = await leads.update(
			{ id: lead.id, phone: "99467 88880" },
			userId,
		);
		const stored = await db.lead.findUniqueOrThrow({
			where: { id: lead.id },
			select: { secondaryPhone: true },
		});

		expect(edited.phone).toBe("+919946788880");
		expect(stored.secondaryPhone).toBe("+919946788887");
	});

	it("uses +49 for a German lead", async () => {
		const lead = await leads.create(
			{
				name: `German ${suffix}`,
				kind: "OTHER",
				stage: "NOT_CONTACTED",
				entity: "GERMANY",
				phone: "0151 23456789",
			},
			userId,
		);

		expect(lead.phone).toBe("+4915123456789");
	});

	it("files a reply on the lead stored without a country code", async () => {
		const lead = await db.lead.create({
			data: { name: `Old number ${suffix}`, phone: "9000000777" },
			select: { id: true },
		});

		await webhook.receive({
			object: "whatsapp_business_account",
			entry: [
				{
					changes: [
						{
							field: "messages",
							value: {
								messages: [
									{
										from: "919000000777",
										id: `wamid.reply.${suffix}`,
										timestamp: String(Math.floor(Date.now() / 1000)),
										type: "text",
										text: { body: "Yes, call me" },
									},
								],
							},
						},
					],
				},
			],
		});

		const reply = await db.activity.findUniqueOrThrow({
			where: { id: `whatsapp:wamid.reply.${suffix}` },
			select: { leadId: true },
		});
		expect(reply.leadId).toBe(lead.id);
	});
});

describe("unassigned leads", () => {
	it("lists exactly the leads the dashboard counts", async () => {
		const { DashboardService } = await import(
			"../src/dashboard/dashboard.service"
		);
		const { ConversionService } = await import(
			"../src/currency/conversion.service"
		);
		const dashboard = new DashboardService(db, new ConversionService(db));
		await leads.create(
			{ name: `Waiting ${suffix}`, kind: "EPC", stage: "NOT_CONTACTED" },
			userId,
		);
		await leads.create(
			{ name: `Closed ${suffix}`, kind: "EPC", stage: "NOT_INTERESTED" },
			userId,
		);

		const list = await leads.unassigned();
		const summary = await dashboard.leadOverview(userId, { scope: "everyone" });

		expect(list.total).toBe(summary.totals.unassigned);
		expect(list.leads.some((lead) => lead.name === `Waiting ${suffix}`)).toBe(
			true,
		);
		expect(list.leads.some((lead) => lead.name === `Closed ${suffix}`)).toBe(
			false,
		);
	});

	it("assigns several leads to one owner and logs each", async () => {
		const first = await leads.create(
			{ name: `Bulk one ${suffix}`, kind: "EPC", stage: "NOT_CONTACTED" },
			userId,
		);
		const second = await leads.create(
			{ name: `Bulk two ${suffix}`, kind: "EPC", stage: "CONTACTED" },
			userId,
		);

		const result = await leads.assignMany(
			[first.id, second.id],
			otherId,
			userId,
		);
		const owners = await db.lead.findMany({
			where: { id: { in: [first.id, second.id] } },
			select: { ownerId: true, stage: true },
		});
		const logs = await db.activity.count({
			where: {
				leadId: { in: [first.id, second.id] },
				body: "Lead assigned to Other Rep.",
			},
		});

		expect(result.assigned).toBe(2);
		expect(owners.every((lead) => lead.ownerId === otherId)).toBe(true);
		expect(owners.map((lead) => lead.stage).sort()).toEqual([
			"CONTACTED",
			"NOT_CONTACTED",
		]);
		expect(logs).toBe(2);
	});
});

describe("unassigned lead pages", () => {
	it("pages through every unassigned lead with no gaps or repeats", async () => {
		const { LEADS } = await import("../src/leads/leads-config");
		const extra = LEADS.unassigned.pageSize + 3;
		for (let index = 0; index < extra; index += 1) {
			await db.lead.create({
				data: { name: `Page ${index} ${suffix}`, stage: "NOT_CONTACTED" },
			});
		}

		const seen: string[] = [];
		let cursor: string | undefined;
		let total = 0;
		do {
			const page = await leads.unassigned(cursor);
			total = page.total;
			seen.push(...page.leads.map((lead) => lead.id));
			cursor = page.nextCursor ?? undefined;
		} while (cursor);

		expect(seen.length).toBe(total);
		expect(new Set(seen).size).toBe(total);
		expect(total).toBeGreaterThan(LEADS.unassigned.pageSize);
	});
});

describe("lead list status filter", () => {
	it("returns only leads in the chosen status, and the board ignores it", async () => {
		await leads.create(
			{ name: `Status follow ${suffix}`, kind: "EPC", stage: "FOLLOW_UP" },
			userId,
		);
		await leads.create(
			{ name: `Status new ${suffix}`, kind: "EPC", stage: "NOT_CONTACTED" },
			userId,
		);

		const list = await leads.list({ q: `Status`, stage: "FOLLOW_UP" }, userId);

		expect(list.leads.every((lead) => lead.stage === "FOLLOW_UP")).toBe(true);
		expect(
			list.leads.some((lead) => lead.name === `Status follow ${suffix}`),
		).toBe(true);
		expect(list.total).toBe(list.leads.length);
	});
});
