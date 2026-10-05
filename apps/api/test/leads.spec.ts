import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";
import { DASHBOARD } from "../src/dashboard/dashboard-config";
import { LeadsService } from "../src/leads/leads.service";

const suffix = crypto.randomUUID();
const userId = `lead-user-${suffix}`;
const otherId = `lead-other-${suffix}`;

const service = new LeadsService(db, new AgentTriggerService(db));
const dashboard = new DashboardService(db, new ConversionService(db));

async function createLead(name: string, ownerId?: string) {
	return service.create(
		{ name, kind: "EPC", stage: "NOT_CONTACTED", ownerId },
		userId,
	);
}

async function positions(stage: "NOT_CONTACTED" | "CONTACTED") {
	const rows = await db.lead.findMany({
		where: { stage, archivedAt: null },
		orderBy: [{ position: "asc" }, { createdAt: "desc" }],
		select: { name: true, position: true },
	});

	return rows;
}

beforeAll(async () => {
	await db.user.createMany({
		data: [
			{ id: userId, name: "Lead Owner", email: `${userId}@example.test` },
			{ id: otherId, name: "Other Rep", email: `${otherId}@example.test` },
		],
		skipDuplicates: true,
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
	await db.lead.deleteMany({
		where: { OR: [{ ownerId: userId }, { ownerId: null }] },
	});
	await db.contact.deleteMany({ where: { ownerId: userId } });
	await db.company.deleteMany({ where: { ownerId: userId } });
	await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

describe("the lead board", () => {
	it("starts a new lead as Not contacted with nobody on it", async () => {
		const lead = await createLead(`New ${suffix}`);

		expect(lead.stage).toBe("NOT_CONTACTED");
		expect(lead.owner).toBeNull();
	});

	it("keeps the status when an owner is named", async () => {
		const lead = await createLead(`Owned ${suffix}`, userId);

		expect(lead.stage).toBe("NOT_CONTACTED");
		expect(lead.owner?.id).toBe(userId);
	});

	it("keeps the owner on a lead moved back to Not contacted", async () => {
		const lead = await createLead(`Returning ${suffix}`, userId);
		const back = await service.move(
			{ id: lead.id, stage: "NOT_CONTACTED" },
			otherId,
		);

		expect(back.stage).toBe("NOT_CONTACTED");
		expect(back.owner?.id).toBe(userId);
	});

	it("gives an unowned lead to whoever moves it forward", async () => {
		const lead = await createLead(`Dragged ${suffix}`);
		const moved = await service.move(
			{ id: lead.id, stage: "CONTACTED" },
			otherId,
		);

		expect(moved.stage).toBe("CONTACTED");
		expect(moved.owner?.id).toBe(otherId);
	});

	it("assigns an owner without touching the status", async () => {
		const lead = await createLead(`Assignable ${suffix}`);
		const assigned = await service.assign(lead.id, otherId, userId);

		expect(assigned.stage).toBe("NOT_CONTACTED");
		expect(assigned.owner?.id).toBe(otherId);
	});

	it("stores the extra lead details and clears only what is sent", async () => {
		const lead = await service.create(
			{
				name: `Detailed ${suffix}`,
				kind: "EPC",
				stage: "NOT_CONTACTED",
				designation: "Procurement head",
				secondaryPhone: "+91 90000 00001",
				secondaryEmail: "Second@Example.test",
				website: "https://example.test",
				state: "Kerala",
				address: "MG Road",
				nextAction: "Call on Monday",
			},
			userId,
		);
		await service.update({ id: lead.id, nextAction: "" }, userId);
		const detail = await service.byId(lead.id);

		expect(detail.designation).toBe("Procurement head");
		expect(detail.secondaryEmail).toBe("second@example.test");
		expect(detail.state).toBe("Kerala");
		expect(detail.address).toBe("MG Road");
		expect(detail.nextAction).toBeNull();
	});

	it("converts a lead into a company and contact, once", async () => {
		const lead = await service.create(
			{
				name: `Asha Menon ${suffix}`,
				companyName: `Sunrise EPC ${suffix}`,
				email: `asha-${suffix}@example.test`,
				phone: "+91 90000 00002",
				designation: "Director",
				kind: "EPC",
				stage: "ONBOARDED",
				ownerId: userId,
				country: "India",
				state: "Kerala",
			},
			userId,
		);

		const first = await service.convert(lead.id, userId);
		const again = await service.convert(lead.id, userId);

		const company = await db.company.findUniqueOrThrow({
			where: { id: first.companyId },
		});
		const contact = await db.contact.findUniqueOrThrow({
			where: { id: first.contactId },
		});

		expect(again).toEqual(first);
		expect(company.name).toBe(`Sunrise EPC ${suffix}`);
		expect(company.accountType).toBe("EPC");
		expect(company.state).toBe("Kerala");
		expect(company.convertedAt).not.toBeNull();
		expect(company.primaryContactId).toBe(contact.id);
		expect(contact.firstName).toBe("Asha");
		expect(contact.title).toBe("Director");
		expect(contact.companyId).toBe(company.id);
	});

	it("links a customer to a serving EPC, or keeps a typed EPC name", async () => {
		const epc = await db.company.create({
			data: {
				name: `Serving EPC ${suffix}`,
				accountType: "EPC",
				ownerId: userId,
			},
		});
		const linked = await service.create(
			{
				name: `Customer linked ${suffix}`,
				kind: "CUSTOMER",
				stage: "NOT_CONTACTED",
				ownerId: userId,
				servingEpcId: epc.id,
			},
			userId,
		);
		const typed = await service.create(
			{
				name: `Customer typed ${suffix}`,
				kind: "CUSTOMER",
				stage: "NOT_CONTACTED",
				ownerId: userId,
				servingEpcName: "Sunrise Installers",
			},
			userId,
		);

		expect(linked.servingEpc).toEqual({ id: epc.id, name: epc.name });
		expect(typed.servingEpc).toBeNull();
		expect(typed.servingEpcName).toBe("Sunrise Installers");
		const untyped = await db.company.create({
			data: { name: `Untyped installer ${suffix}`, ownerId: userId },
		});
		const customerAccount = await db.company.create({
			data: {
				name: `Customer account ${suffix}`,
				accountType: "CUSTOMER",
				ownerId: userId,
			},
		});
		const options = (await service.epcOptions()).map((option) => option.id);

		expect(options).toContain(epc.id);
		expect(options).toContain(untyped.id);
		expect(options).not.toContain(customerAccount.id);
		expect(options.indexOf(epc.id)).toBeLessThan(options.indexOf(untyped.id));
	});

	it("converts a customer with no company into an account named after them", async () => {
		const lead = await service.create(
			{
				name: `Ravi Customer ${suffix}`,
				kind: "CUSTOMER",
				stage: "ONBOARDED",
				ownerId: userId,
			},
			userId,
		);

		const result = await service.convert(lead.id, userId);
		const company = await db.company.findUniqueOrThrow({
			where: { id: result.companyId },
		});

		expect(company.name).toBe(`Ravi Customer ${suffix}`);
		expect(company.accountType).toBe("CUSTOMER");
	});

	it("refuses to convert a lead with no company name", async () => {
		const lead = await createLead(`No company ${suffix}`);

		await expect(service.convert(lead.id, userId)).rejects.toThrow(
			"Add the company name",
		);
	});

	it("drops a card between two neighbours without a tie", async () => {
		await db.lead.deleteMany({});

		const bottom = await createLead(`Bottom ${suffix}`);
		const top = await createLead(`Top ${suffix}`);
		const mover = await createLead(`Mover ${suffix}`);

		await service.move(
			{
				id: mover.id,
				stage: "NOT_CONTACTED",
				beforeId: top.id,
				afterId: bottom.id,
			},
			userId,
		);

		const rows = await positions("NOT_CONTACTED");
		const seen = new Set(rows.map((row) => row.position));

		expect(seen.size).toBe(rows.length);
		expect(rows.map((row) => row.name)).toEqual([
			top.name,
			mover.name,
			bottom.name,
		]);
	});

	it("still finds the neighbour when only one side is named", async () => {
		await db.lead.deleteMany({});

		const bottom = await createLead(`Low ${suffix}`);
		const top = await createLead(`High ${suffix}`);
		const mover = await createLead(`Between ${suffix}`);

		await service.move(
			{ id: mover.id, stage: "NOT_CONTACTED", afterId: bottom.id },
			userId,
		);

		const rows = await positions("NOT_CONTACTED");
		const seen = new Set(rows.map((row) => row.position));

		expect(seen.size).toBe(rows.length);
		expect(rows.map((row) => row.name)).toEqual([
			top.name,
			mover.name,
			bottom.name,
		]);
	});

	it("counts every stage, including the empty ones", async () => {
		await db.lead.deleteMany({});
		await createLead(`Counted ${suffix}`);

		const board = await service.board({}, userId);

		expect(board.columns).toHaveLength(7);
		expect(board.columns.map((column) => column.stage)).toEqual([
			"NOT_CONTACTED",
			"CONTACTED",
			"INTERESTED",
			"FOLLOW_UP",
			"ONBOARDED",
			"NOT_INTERESTED",
			"NOT_QUALIFIED",
		]);
		expect(board.columns[0]?.total).toBe(1);
	});

	it("keeps an archived lead off the board", async () => {
		await db.lead.deleteMany({});
		const lead = await createLead(`Archived ${suffix}`);

		await service.remove(lead.id);

		const board = await service.board({}, userId);

		expect(board.columns[0]?.total).toBe(0);
	});

	it("summarizes operational lead metrics without deal values", async () => {
		await db.lead.deleteMany({});
		const lead = await service.create(
			{
				name: `Website ${suffix}`,
				kind: "CUSTOMER",
				stage: "NOT_CONTACTED",
				ownerId: userId,
				entity: "INDIA",
				source: "Website form",
			},
			userId,
		);
		await db.lead.update({
			where: { id: lead.id },
			data: {
				lastActivityAt: new Date(
					Date.now() - (DASHBOARD.leads.staleDays + 1) * DASHBOARD.dayMs,
				),
			},
		});

		const summary = await dashboard.leadOverview(userId, { scope: "me" });

		expect(summary.totals.all).toBe(1);
		expect(summary.totals.active).toBe(1);
		expect(summary.totals.needsAttention).toBe(1);
		expect(summary.stages).toHaveLength(7);
		expect(summary.sources[0]).toEqual({
			source: "Website form",
			count: 1,
		});
		expect(summary.entities).toContainEqual({ entity: "INDIA", count: 1 });
	});

	it("deduplicates intake records by external ID and email", async () => {
		await db.lead.deleteMany({});
		const input = {
			name: `Intake ${suffix}`,
			email: `intake-${suffix}@example.test`,
			kind: "CUSTOMER" as const,
			stage: "NOT_CONTACTED" as const,
			source: "Website API",
			externalId: `submission-${suffix}`,
		};
		const first = await service.intake(input, userId);
		const repeat = await service.intake(input, userId);

		expect(first.created).toBe(true);
		expect(repeat).toEqual({ id: first.id, created: false });
		expect(await db.lead.count({ where: { email: input.email } })).toBe(1);
	});

	it("updates repeated Zoho imports instead of duplicating leads", async () => {
		await db.lead.deleteMany({});
		const zohoId = `zoho-${suffix}`;
		const first = await service.importZoho(
			[
				{
					zohoId,
					name: `Zoho ${suffix}`,
					email: `zoho-${suffix}@example.test`,
				},
			],
			userId,
		);
		const repeat = await service.importZoho(
			[{ zohoId, name: `Updated ${suffix}`, stage: "INTERESTED" }],
			userId,
		);
		const lead = await db.lead.findUniqueOrThrow({ where: { zohoId } });

		expect(first).toMatchObject({ created: 1, updated: 0, failed: 0 });
		expect(repeat).toMatchObject({ created: 0, updated: 1, failed: 0 });
		expect(lead.name).toBe(`Updated ${suffix}`);
		expect(lead.stage).toBe("INTERESTED");
	});
});
