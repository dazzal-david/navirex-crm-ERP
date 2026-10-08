import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CommunicationsService } from "../src/communications/communications.service";
import { WhatsAppWebhookService } from "../src/communications/whatsapp-webhook.service";
import { LeadContactsService } from "../src/leads/lead-contacts.service";
import { LeadsService } from "../src/leads/leads.service";

const suffix = crypto.randomUUID();
const userId = `contacts-user-${suffix}`;
const MINUTE_MS = 60_000;

const leads = new LeadsService(db, new AgentTriggerService(db));
const contacts = new LeadContactsService(db);
const communications = new CommunicationsService(
	db,
	{} as never,
	{} as never,
	{ get: () => undefined } as never,
);
const webhook = new WhatsAppWebhookService(db, leads, {
	get: () => undefined,
} as never);

function uniquePhone(seed: number) {
	return `+9170${String(Date.now() + seed).slice(-8)}`;
}

async function epc(name: string, person: string, phone: string) {
	return leads.create(
		{
			name: `${person} ${suffix}`,
			companyName: `${name} ${suffix}`,
			kind: "EPC",
			stage: "CONTACTED",
			phone,
			ownerId: userId,
		},
		userId,
	);
}

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Contacts Rep",
			email: `${userId}@example.test`,
			createdAt: new Date(Date.now() - 60 * MINUTE_MS),
		},
	});
});

afterAll(async () => {
	await db.agentTask.deleteMany({
		where: {
			kind: "agent-event",
			reason: { in: ["lead.created", "company.created", "contact.created"] },
		},
	});
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.lead.deleteMany({ where: { ownerId: userId } });
	await db.lead.deleteMany({ where: { name: { endsWith: suffix } } });
	await db.contact.deleteMany({ where: { ownerId: userId } });
	await db.company.deleteMany({ where: { ownerId: userId } });
	await db.user.delete({ where: { id: userId } });
});

describe("contacts on a lead", () => {
	it("adds a second person with a country code and logs it", async () => {
		const lead = await epc("True Sun", "Silpa", uniquePhone(1));

		const athul = await contacts.add(
			{
				leadId: lead.id,
				name: "Athul",
				phone: "7902222896",
				designation: "Engineer",
			},
			userId,
		);

		expect(athul.phone).toBe("+917902222896");
		expect((await contacts.list(lead.id)).map((row) => row.name)).toEqual([
			"Athul",
		]);
		const log = await db.activity.findFirst({
			where: { leadId: lead.id, body: "Contact added: Athul." },
			select: { type: true },
		});
		expect(log?.type).toBe(ActivityType.STAGE_CHANGE);
	});

	it("swaps the main contact without losing either person", async () => {
		const silpaPhone = uniquePhone(2);
		const lead = await epc("Swap Co", "Silpa", silpaPhone);
		const athul = await contacts.add(
			{ leadId: lead.id, name: "Athul", phone: "+919000000123" },
			userId,
		);

		await contacts.makePrimary(athul.id, userId);

		const after = await db.lead.findUniqueOrThrow({
			where: { id: lead.id },
			select: { name: true, phone: true },
		});
		const extra = await db.leadContact.findUniqueOrThrow({
			where: { id: athul.id },
			select: { name: true, phone: true },
		});
		expect(after).toEqual({ name: "Athul", phone: "+919000000123" });
		expect(extra).toEqual({ name: `Silpa ${suffix}`, phone: silpaPhone });
	});

	it("finds a lead by an extra contact's name in search", async () => {
		const lead = await epc("Search Co", "Main", uniquePhone(3));
		await contacts.add(
			{ leadId: lead.id, name: `Zarathustra ${suffix}` },
			userId,
		);

		const found = await leads.list({ q: `Zarathustra ${suffix}` }, userId);

		expect(found.leads.map((row) => row.id)).toEqual([lead.id]);
	});

	it("matches a website enquiry from a known contact to the existing lead", async () => {
		const lead = await epc("Intake Co", "Main", uniquePhone(4));
		await contacts.add(
			{
				leadId: lead.id,
				name: "Soniya",
				email: `soniya-${suffix}@example.test`,
			},
			userId,
		);

		const result = await leads.intake(
			{
				name: "Soniya",
				email: `SONIYA-${suffix}@example.test`,
				kind: "EPC",
				stage: "NOT_CONTACTED",
			},
			userId,
		);

		expect(result).toEqual({ id: lead.id, created: false });
	});
});

describe("same company and merge", () => {
	it("flags another lead with the same company name", async () => {
		const first = await epc("Twin Solar", "Silpa", uniquePhone(5));
		const second = await epc("twin solar", "Athul", uniquePhone(6));

		const matches = await contacts.sameCompany(second.id);

		expect(matches.map((row) => row.id)).toEqual([first.id]);
	});

	it("moves the person, notes and messages, then archives the duplicate", async () => {
		const athulPhone = uniquePhone(7);
		const target = await epc("Merge Solar", "Silpa", uniquePhone(8));
		const source = await epc("Merge Solar", "Athul", athulPhone);
		await communications.addNote(
			{ leadId: source.id, body: "Athul wants a quote" },
			userId,
		);
		await contacts.add({ leadId: source.id, name: "Soniya" }, userId);

		await contacts.merge(source.id, target.id, userId);

		const people = (await contacts.list(target.id)).map((row) => [
			row.name,
			row.phone,
		]);
		const notes = (await communications.notes(target.id)).map(
			(note) => note.body,
		);
		const archived = await db.lead.findUniqueOrThrow({
			where: { id: source.id },
			select: { archivedAt: true },
		});
		const kept = await db.lead.findUniqueOrThrow({
			where: { id: target.id },
			select: { ownerId: true, stage: true, archivedAt: true },
		});
		expect(people).toEqual([
			["Soniya", null],
			[`Athul ${suffix}`, athulPhone],
		]);
		expect(notes).toEqual(["Athul wants a quote"]);
		expect(archived.archivedAt).not.toBeNull();
		expect(kept).toEqual({
			ownerId: userId,
			stage: "CONTACTED",
			archivedAt: null,
		});
	});

	it("refuses to merge a lead into itself", async () => {
		const lead = await epc("Self Co", "Main", uniquePhone(9));

		await expect(contacts.merge(lead.id, lead.id, userId)).rejects.toThrow(
			"A lead cannot be merged into itself.",
		);
	});
});

describe("messaging a contact", () => {
	it("files a reply from an extra contact on the company lead", async () => {
		const lead = await epc("Reply Co", "Main", uniquePhone(10));
		const extra = await contacts.add(
			{ leadId: lead.id, name: "Athul", phone: "+919111100022" },
			userId,
		);

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
										from: "919111100022",
										id: `wamid.contact.${suffix}`,
										timestamp: String(Math.floor(Date.now() / 1000)),
										type: "text",
										text: { body: "From Athul" },
									},
								],
							},
						},
					],
				},
			],
		});

		const reply = await db.activity.findUniqueOrThrow({
			where: { id: `whatsapp:wamid.contact.${suffix}` },
			select: { leadId: true, meta: true },
		});
		expect(reply.leadId).toBe(lead.id);
		expect(reply.meta).toMatchObject({ contactId: extra.id });
	});

	it("opens the 24-hour window only for the person who replied", async () => {
		const mainPhone = "+919222200033";
		const lead = await leads.create(
			{
				name: `Window main ${suffix}`,
				companyName: `Window Co ${suffix}`,
				kind: "EPC",
				stage: "CONTACTED",
				phone: mainPhone,
			},
			userId,
		);
		const extra = await contacts.add(
			{ leadId: lead.id, name: "Athul", phone: "+919222200044" },
			userId,
		);
		await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "WhatsApp message",
				body: "Hi",
				leadId: lead.id,
				createdById: userId,
				occurredAt: new Date(Date.now() - 5 * MINUTE_MS),
				meta: {
					channel: "whatsapp",
					direction: "inbound",
					from: "919222200044",
				},
			},
		});

		const forAthul = await communications.whatsappWindow(lead.id, extra.id);
		const forMain = await communications.whatsappWindow(lead.id);

		expect(forAthul.open).toBe(true);
		expect(forMain.open).toBe(false);
	});

	it("lists the main contact first, then the others", async () => {
		const lead = await epc("Recipients Co", "Main", uniquePhone(11));
		await contacts.add(
			{ leadId: lead.id, name: "Athul", email: `athul-${suffix}@example.test` },
			userId,
		);

		const recipients = await communications.recipients(lead.id);

		expect(recipients.map((row) => [row.name, row.primary])).toEqual([
			[`Main ${suffix}`, true],
			["Athul", false],
		]);
	});
});

describe("converting a lead with several contacts", () => {
	it("creates a contact on the account for every person", async () => {
		const lead = await epc("Convert Co", "Silpa", uniquePhone(12));
		await contacts.add(
			{
				leadId: lead.id,
				name: "Athul Kumar",
				email: `athul-c-${suffix}@example.test`,
			},
			userId,
		);

		const result = await leads.convert(lead.id, userId);

		const people = await db.contact.findMany({
			where: { companyId: result.companyId },
			select: { firstName: true, lastName: true },
			orderBy: { createdAt: "asc" },
		});
		expect(people.map((person) => person.firstName)).toEqual([
			"Silpa",
			"Athul",
		]);
	});
});
