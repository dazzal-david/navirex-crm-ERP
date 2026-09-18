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
		{ name, kind: "EPC", stage: "UNASSIGNED", ownerId },
		userId,
	);
}

async function positions(stage: "UNASSIGNED" | "TALKING") {
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
		where: { kind: "agent-event", reason: "lead.created" },
	});
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.lead.deleteMany({
		where: { OR: [{ ownerId: userId }, { ownerId: null }] },
	});
	await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

describe("the lead board", () => {
	it("puts a new lead in Unassigned with nobody on it", async () => {
		const lead = await createLead(`New ${suffix}`);

		expect(lead.stage).toBe("UNASSIGNED");
		expect(lead.owner).toBeNull();
	});

	it("does not leave a named owner sitting in Unassigned", async () => {
		const lead = await createLead(`Owned ${suffix}`, userId);

		expect(lead.stage).toBe("ASSIGNED");
		expect(lead.owner?.id).toBe(userId);
	});

	it("takes the owner off a lead sent back to Unassigned", async () => {
		const lead = await createLead(`Returning ${suffix}`, userId);
		const back = await service.move(
			{ id: lead.id, stage: "UNASSIGNED" },
			userId,
		);

		expect(back.stage).toBe("UNASSIGNED");
		expect(back.owner).toBeNull();
	});

	it("gives an unowned lead to whoever drags it out of Unassigned", async () => {
		const lead = await createLead(`Dragged ${suffix}`);
		const moved = await service.move(
			{ id: lead.id, stage: "TALKING" },
			otherId,
		);

		expect(moved.stage).toBe("TALKING");
		expect(moved.owner?.id).toBe(otherId);
	});

	it("moves a lead out of Unassigned when somebody is given it", async () => {
		const lead = await createLead(`Assignable ${suffix}`);
		const assigned = await service.assign(lead.id, otherId, userId);

		expect(assigned.stage).toBe("ASSIGNED");
		expect(assigned.owner?.id).toBe(otherId);
	});

	it("drops a card between two neighbours without a tie", async () => {
		await db.lead.deleteMany({});

		const bottom = await createLead(`Bottom ${suffix}`);
		const top = await createLead(`Top ${suffix}`);
		const mover = await createLead(`Mover ${suffix}`);

		await service.move(
			{
				id: mover.id,
				stage: "UNASSIGNED",
				beforeId: top.id,
				afterId: bottom.id,
			},
			userId,
		);

		const rows = await positions("UNASSIGNED");
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
			{ id: mover.id, stage: "UNASSIGNED", afterId: bottom.id },
			userId,
		);

		const rows = await positions("UNASSIGNED");
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

		expect(board.columns).toHaveLength(6);
		expect(board.columns.map((column) => column.stage)).toEqual([
			"UNASSIGNED",
			"ASSIGNED",
			"TALKING",
			"INTERESTED",
			"REJECTED",
			"APPROVED",
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
				stage: "UNASSIGNED",
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
		expect(summary.stages).toHaveLength(6);
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
			stage: "UNASSIGNED" as const,
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
