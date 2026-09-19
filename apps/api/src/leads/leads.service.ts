import { ActivityType, type Db, type LeadStage, type Prisma } from "@crm/db";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import {
	type BoardInput,
	type BoardOutput,
	type ColumnPageInput,
	type ColumnPageOutput,
	LEAD_STAGES,
	type LeadCreateInput,
	type LeadIntakeInput,
	type LeadListInput,
	type LeadListOutput,
	type LeadMoveInput,
	type LeadUpdateInput,
	type ZohoLeadRow,
} from "./leads.contracts";
import { LEADS } from "./leads-config";

const cardSelect = {
	id: true,
	name: true,
	companyName: true,
	email: true,
	phone: true,
	kind: true,
	entity: true,
	stage: true,
	position: true,
	source: true,
	country: true,
	rejectedReason: true,
	lastActivityAt: true,
	createdAt: true,
	owner: {
		select: { id: true, name: true, image: true, designation: true },
	},
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadsService {
	private readonly logger = new Logger(LeadsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	private where(input: BoardInput, userId: string): Prisma.LeadWhereInput {
		const where: Prisma.LeadWhereInput = { archivedAt: null };

		if (input.entity) where.entity = input.entity;
		if (input.kind) where.kind = input.kind;
		if (input.mine) where.ownerId = userId;
		else if (input.ownerId) where.ownerId = input.ownerId;

		const q = input.q?.trim();
		if (q) {
			where.OR = [
				{ name: { contains: q, mode: "insensitive" } },
				{ companyName: { contains: q, mode: "insensitive" } },
				{ email: { contains: q, mode: "insensitive" } },
				{ phone: { contains: q, mode: "insensitive" } },
			];
		}

		return where;
	}

	async board(input: BoardInput, userId: string): Promise<BoardOutput> {
		const where = this.where(input, userId);

		const [totals, leads] = await Promise.all([
			this.db.lead.groupBy({
				by: ["stage"],
				where,
				_count: { _all: true },
			}),
			Promise.all(
				LEAD_STAGES.map((stage) =>
					this.db.lead.findMany({
						where: { ...where, stage },
						select: cardSelect,
						orderBy: [{ position: "asc" }, { createdAt: "desc" }],
						take: LEADS.board.columnLimit,
					}),
				),
			),
		]);

		const countOf = new Map(
			totals.map((row) => [row.stage, row._count._all] as const),
		);

		return {
			columns: LEAD_STAGES.map((stage, index) => ({
				stage,
				total: countOf.get(stage) ?? 0,
				leads: leads[index] ?? [],
			})),
		};
	}

	async column(
		input: ColumnPageInput,
		userId: string,
	): Promise<ColumnPageOutput> {
		const where = this.where(input, userId);
		const columnWhere: Prisma.LeadWhereInput = {
			...where,
			stage: input.stage,
		};
		if (input.cursor !== undefined) {
			columnWhere.position = { gt: input.cursor };
		}

		const leads = await this.db.lead.findMany({
			where: columnWhere,
			select: cardSelect,
			orderBy: [{ position: "asc" }, { createdAt: "desc" }],
			take: LEADS.board.columnLimit,
		});

		const last = leads.at(-1);

		return {
			leads,
			nextCursor:
				leads.length < LEADS.board.columnLimit
					? null
					: (last?.position ?? null),
		};
	}

	async list(input: LeadListInput, userId: string): Promise<LeadListOutput> {
		const where = this.where(input, userId);
		const pageSize = 50;
		const [total, rows] = await Promise.all([
			this.db.lead.count({ where }),
			this.db.lead.findMany({
				where,
				select: cardSelect,
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				take: pageSize + 1,
				cursor: input.cursor ? { id: input.cursor } : undefined,
				skip: input.cursor ? 1 : undefined,
			}),
		]);
		const hasMore = rows.length > pageSize;
		const leads = hasMore ? rows.slice(0, pageSize) : rows;

		return {
			leads,
			total,
			nextCursor: hasMore ? (leads.at(-1)?.id ?? null) : null,
		};
	}

	async byId(id: string) {
		const lead = await this.db.lead.findUnique({
			where: { id },
			select: {
				...cardSelect,
				notes: true,
				zohoId: true,
				stageChangedAt: true,
				updatedAt: true,
			},
		});

		if (!lead) throw new NotFoundException("That lead no longer exists.");

		return lead;
	}

	async owners() {
		return this.db.user.findMany({
			select: {
				id: true,
				name: true,
				email: true,
				image: true,
				designation: true,
			},
			orderBy: { name: "asc" },
		});
	}

	async create(input: LeadCreateInput, userId: string) {
		const stage: LeadStage =
			input.ownerId && input.stage === "UNASSIGNED" ? "ASSIGNED" : input.stage;
		const position = await this.topOf(stage);
		const source = blank(input.source) ?? "Manual entry";
		const lead = await this.agent.withCrmEvents(async (tx, emit) => {
			const created = await tx.lead.create({
				data: {
					name: input.name,
					companyName: blank(input.companyName),
					email: blank(input.email),
					phone: blank(input.phone),
					kind: input.kind,
					entity: input.entity ?? null,
					stage,
					ownerId: input.ownerId ?? null,
					source,
					country: blank(input.country),
					notes: blank(input.notes),
					position,
				},
				select: cardSelect,
			});
			await emit({
				type: "lead.created",
				record: { kind: "lead", id: created.id },
				occurredAt: created.createdAt,
				data: { source, stage, channel: "manual" },
			});
			return created;
		});

		await this.log(lead.id, userId, `Lead created in ${stage}.`);

		return lead;
	}

	async intake(
		input: LeadIntakeInput,
		userId?: string,
	): Promise<{ id: string; created: boolean }> {
		const source = blank(input.source) ?? "API";
		const email = blank(input.email)?.toLowerCase() ?? null;
		const phone = blank(input.phone);
		const externalId = blank(input.externalId);

		const existing = await this.db.lead.findFirst({
			where: {
				archivedAt: null,
				OR: [
					...(externalId ? [{ source, externalId }] : []),
					...(email
						? [{ email: { equals: email, mode: "insensitive" as const } }]
						: []),
					...(phone ? [{ phone }] : []),
				],
			},
			select: { id: true },
		});

		if (existing) {
			await this.logAutomated(
				existing.id,
				userId,
				`Lead intake matched ${source}.`,
			);
			return { id: existing.id, created: false };
		}

		const stage: LeadStage =
			input.ownerId && input.stage === "UNASSIGNED" ? "ASSIGNED" : input.stage;
		const position = await this.topOf(stage);
		const lead = await this.agent.withCrmEvents(async (tx, emit) => {
			const created = await tx.lead.create({
				data: {
					name: input.name,
					companyName: blank(input.companyName),
					email,
					phone,
					kind: input.kind,
					entity: input.entity ?? null,
					stage,
					ownerId: input.ownerId ?? null,
					source,
					externalId,
					country: blank(input.country),
					notes: blank(input.notes),
					position,
				},
				select: { id: true, createdAt: true },
			});
			await emit({
				type: "lead.created",
				record: { kind: "lead", id: created.id },
				occurredAt: created.createdAt,
				data: { source, stage, channel: "intake" },
			});
			return created;
		});

		await this.logAutomated(lead.id, userId, `Lead received from ${source}.`);
		return { id: lead.id, created: true };
	}

	async importZoho(rows: ZohoLeadRow[], userId: string) {
		let created = 0;
		let updated = 0;
		const errors: { row: number; message: string }[] = [];

		for (const [index, row] of rows.entries()) {
			try {
				const email = blank(row.email)?.toLowerCase() ?? null;
				const existing = await this.db.lead.findFirst({
					where: {
						OR: [
							{ zohoId: row.zohoId },
							...(email
								? [{ email: { equals: email, mode: "insensitive" as const } }]
								: []),
						],
					},
					select: { id: true, stage: true },
				});
				if (existing) {
					const data: Prisma.LeadUncheckedUpdateInput = {
						name: row.name,
						zohoId: row.zohoId,
					};
					if (row.companyName !== undefined)
						data.companyName = blank(row.companyName);
					if (row.email !== undefined) data.email = email;
					if (row.phone !== undefined) data.phone = blank(row.phone);
					if (row.kind !== undefined) data.kind = row.kind;
					if (row.entity !== undefined) data.entity = row.entity;
					if (row.ownerId !== undefined) data.ownerId = row.ownerId;
					if (row.source !== undefined) data.source = blank(row.source);
					if (row.country !== undefined) data.country = blank(row.country);
					if (row.notes !== undefined) data.notes = blank(row.notes);
					if (row.stage !== undefined && row.stage !== existing.stage) {
						data.stage = row.stage;
						data.stageChangedAt = new Date();
						data.position = await this.topOf(row.stage);
					}
					await this.db.lead.update({ where: { id: existing.id }, data });
					await this.log(existing.id, userId, "Lead updated from Zoho CRM.");
					updated += 1;
				} else {
					const stage = row.stage ?? "UNASSIGNED";
					const position = await this.topOf(stage);
					const source = blank(row.source) ?? "Zoho CRM";
					const lead = await this.agent.withCrmEvents(async (tx, emit) => {
						const imported = await tx.lead.create({
							data: {
								name: row.name,
								companyName: blank(row.companyName),
								email,
								phone: blank(row.phone),
								kind: row.kind ?? "EPC",
								entity: row.entity ?? null,
								stage,
								ownerId: row.ownerId ?? null,
								source,
								country: blank(row.country),
								notes: blank(row.notes),
								zohoId: row.zohoId,
								position,
							},
							select: { id: true, createdAt: true },
						});
						await emit({
							type: "lead.created",
							record: { kind: "lead", id: imported.id },
							occurredAt: imported.createdAt,
							data: { source, stage, channel: "import" },
						});
						return imported;
					});
					await this.log(lead.id, userId, "Lead imported from Zoho CRM.");
					created += 1;
				}
			} catch (error) {
				errors.push({
					row: index + 1,
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return { created, updated, failed: errors.length, errors };
	}

	async update(input: LeadUpdateInput, userId: string) {
		const { id, ...rest } = input;

		const current = await this.db.lead.findUnique({
			where: { id },
			select: { id: true, stage: true },
		});

		if (!current) throw new NotFoundException("That lead no longer exists.");

		const data: Prisma.LeadUpdateInput = {};

		if (rest.name !== undefined) data.name = rest.name;
		if (rest.companyName !== undefined)
			data.companyName = blank(rest.companyName);
		if (rest.email !== undefined) data.email = blank(rest.email);
		if (rest.phone !== undefined) data.phone = blank(rest.phone);
		if (rest.kind !== undefined) data.kind = rest.kind;
		if (rest.entity !== undefined) data.entity = rest.entity ?? null;
		if (rest.source !== undefined) data.source = blank(rest.source);
		if (rest.country !== undefined) data.country = blank(rest.country);
		if (rest.notes !== undefined) data.notes = blank(rest.notes);
		if (rest.ownerId !== undefined)
			data.owner = rest.ownerId
				? { connect: { id: rest.ownerId } }
				: { disconnect: true };

		if (rest.stage !== undefined && rest.stage !== current.stage) {
			data.stage = rest.stage;
			data.stageChangedAt = new Date();
			data.position = await this.topOf(rest.stage);
		}

		const lead = await this.db.lead.update({
			where: { id },
			data,
			select: cardSelect,
		});

		await this.log(id, userId, "Lead updated.");

		return lead;
	}

	async assign(id: string, ownerId: string | null, userId: string) {
		const current = await this.db.lead.findUnique({
			where: { id },
			select: { stage: true },
		});

		if (!current) throw new NotFoundException("That lead no longer exists.");

		const stage: LeadStage =
			ownerId === null
				? "UNASSIGNED"
				: current.stage === "UNASSIGNED"
					? "ASSIGNED"
					: current.stage;

		const data: Prisma.LeadUncheckedUpdateInput = { ownerId, stage };
		if (stage !== current.stage) {
			data.stageChangedAt = new Date();
			data.position = await this.topOf(stage);
		}

		const lead = await this.db.lead.update({
			where: { id },
			data,
			select: cardSelect,
		});

		await this.log(
			id,
			userId,
			ownerId ? "Lead assigned." : "Lead returned to Unassigned.",
		);

		return lead;
	}

	async move(input: LeadMoveInput, userId: string) {
		const current = await this.db.lead.findUnique({
			where: { id: input.id },
			select: { id: true, stage: true, ownerId: true },
		});

		if (!current) throw new NotFoundException("That lead no longer exists.");

		const position = await this.between(
			input.stage,
			input.beforeId ?? null,
			input.afterId ?? null,
			input.id,
		);

		const movedStage = input.stage !== current.stage;
		const data: Prisma.LeadUncheckedUpdateInput = {
			stage: input.stage,
			position,
		};
		if (movedStage) data.stageChangedAt = new Date();
		if (movedStage && input.stage !== "UNASSIGNED" && !current.ownerId) {
			data.ownerId = userId;
		}
		if (movedStage && input.stage === "UNASSIGNED") data.ownerId = null;

		const lead = await this.db.lead.update({
			where: { id: input.id },
			data,
			select: cardSelect,
		});

		if (movedStage) {
			await this.log(
				input.id,
				userId,
				`Stage changed ${current.stage} → ${input.stage}.`,
			);
		}

		return lead;
	}

	async remove(id: string) {
		await this.db.lead.update({
			where: { id },
			data: { archivedAt: new Date() },
		});

		return { id };
	}

	private async topOf(stage: LeadStage): Promise<number> {
		const first = await this.db.lead.findFirst({
			where: { stage, archivedAt: null },
			orderBy: { position: "asc" },
			select: { position: true },
		});

		return (first?.position ?? 0) - LEADS.position.gap;
	}

	private async between(
		stage: LeadStage,
		beforeId: string | null,
		afterId: string | null,
		movingId: string,
	): Promise<number> {
		const [beforeRow, afterRow] = await Promise.all([
			beforeId
				? this.db.lead.findUnique({
						where: { id: beforeId },
						select: { position: true },
					})
				: null,
			afterId
				? this.db.lead.findUnique({
						where: { id: afterId },
						select: { position: true },
					})
				: null,
		]);

		const [low, high] = await Promise.all([
			beforeRow
				? Promise.resolve(beforeRow.position)
				: afterRow
					? this.neighbourBelow(stage, afterRow.position, movingId)
					: Promise.resolve(null),
			afterRow
				? Promise.resolve(afterRow.position)
				: beforeRow
					? this.neighbourAbove(stage, beforeRow.position, movingId)
					: Promise.resolve(null),
		]);

		if (low === null && high === null) return this.topOf(stage);
		if (low === null && high !== null) return high - LEADS.position.gap;
		if (low !== null && high === null) return low + LEADS.position.gap;

		const bottom = low as number;
		const top = high as number;

		if (top - bottom > 1) return Math.floor((bottom + top) / 2);

		await this.respace(stage);

		return this.between(stage, beforeId, afterId, movingId);
	}

	private async neighbourBelow(
		stage: LeadStage,
		position: number,
		movingId: string,
	): Promise<number | null> {
		const row = await this.db.lead.findFirst({
			where: {
				stage,
				archivedAt: null,
				position: { lt: position },
				id: { not: movingId },
			},
			orderBy: { position: "desc" },
			select: { position: true },
		});

		return row?.position ?? null;
	}

	private async neighbourAbove(
		stage: LeadStage,
		position: number,
		movingId: string,
	): Promise<number | null> {
		const row = await this.db.lead.findFirst({
			where: {
				stage,
				archivedAt: null,
				position: { gt: position },
				id: { not: movingId },
			},
			orderBy: { position: "asc" },
			select: { position: true },
		});

		return row?.position ?? null;
	}

	private async respace(stage: LeadStage): Promise<void> {
		const rows = await this.db.lead.findMany({
			where: { stage, archivedAt: null },
			orderBy: [{ position: "asc" }, { createdAt: "desc" }],
			select: { id: true },
		});

		await this.db.$transaction(
			rows.map((row, index) =>
				this.db.lead.update({
					where: { id: row.id },
					data: { position: (index + 1) * LEADS.position.gap },
				}),
			),
		);

		this.logger.log({ message: "Respaced a lead column", stage });
	}

	private async log(leadId: string, userId: string, body: string) {
		await this.db.$transaction([
			this.db.activity.create({
				data: {
					type: ActivityType.NOTE,
					body,
					leadId,
					createdById: userId,
					occurredAt: new Date(),
				},
			}),
			this.db.lead.update({
				where: { id: leadId },
				data: { lastActivityAt: new Date() },
			}),
		]);
	}

	private async logAutomated(
		leadId: string,
		userId: string | undefined,
		body: string,
	) {
		const authorId =
			userId ??
			(
				await this.db.user.findFirst({
					select: { id: true },
					orderBy: { createdAt: "asc" },
				})
			)?.id;
		if (!authorId) return;
		await this.log(leadId, authorId, body);
	}
}

function blank(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}
