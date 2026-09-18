import {
	ActivityType,
	type Db,
	DealStage,
	LeadStage,
	type Prisma,
} from "@crm/db";
import { OPEN_DEAL_STAGES } from "@crm/db/deal-stage";
import { activityMeta } from "@crm/validation/activity-meta";
import { Injectable } from "@nestjs/common";
import { toCents } from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import type { DashboardSummaryInput } from "./dashboard.contracts";
import { DASHBOARD } from "./dashboard-config";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "short" });
const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

const ACTIVE_LEAD_STAGES = [
	LeadStage.UNASSIGNED,
	LeadStage.ASSIGNED,
	LeadStage.TALKING,
	LeadStage.INTERESTED,
] as const;
const ACTIVE_LEAD_STAGE_SET = new Set<LeadStage>(ACTIVE_LEAD_STAGES);

const LEAD_STAGES = Object.values(LeadStage);

function monthStart(from: Date, offset: number): Date {
	return new Date(from.getFullYear(), from.getMonth() + offset, 1);
}

function monthKey(date: Date): number {
	return date.getFullYear() * 12 + date.getMonth();
}

@Injectable()
export class DashboardService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly conversion: ConversionService,
	) {}

	async summary(actingUserId: string, input: DashboardSummaryInput) {
		const mine = input.scope === "me";
		const owned = mine ? { ownerId: actingUserId } : {};

		const now = new Date();
		const startOfMonth = monthStart(now, 0);
		const startOfNextMonth = monthStart(now, 1);
		const startOfPrevMonth = monthStart(now, -1);
		const trendStart = monthStart(now, -(DASHBOARD.sales.trendMonths - 1));
		const rateStart = new Date(
			now.getTime() - DASHBOARD.sales.rateWindowDays * DASHBOARD.dayMs,
		);

		const base = await this.conversion.reportingCurrency();
		const counted = this.conversion.countedWhere(base);

		const [
			openByStage,
			openValueByStage,
			recentDeals,
			closingThisMonthTotals,
			biggestOpen,
			overdueTasks,
			recentActivity,
			unconverted,
		] = await Promise.all([
			this.db.deal.groupBy({
				by: ["stage"],
				where: { ...owned, stage: { in: [...OPEN_DEAL_STAGES] } },
				_count: { _all: true },
			}),
			this.db.deal.groupBy({
				by: ["stage"],
				where: {
					AND: [{ ...owned, stage: { in: [...OPEN_DEAL_STAGES] } }, counted],
				},
				_sum: { baseAmount: true },
			}),
			this.db.deal.findMany({
				where: {
					...owned,
					OR: [
						{ createdAt: { gte: trendStart } },
						{ closedAt: { gte: trendStart } },
					],
				},
				select: {
					baseAmount: true,
					baseCurrency: true,
					stage: true,
					createdAt: true,
					closedAt: true,
				},
			}),
			this.db.deal.aggregate({
				where: {
					AND: [
						{
							...owned,
							stage: { in: [...OPEN_DEAL_STAGES] },
							expectedCloseDate: { gte: startOfMonth, lt: startOfNextMonth },
						},
						counted,
					],
				},
				_count: { _all: true },
				_sum: { baseAmount: true },
			}),
			this.db.deal.findMany({
				where: { ...owned, stage: { in: [...OPEN_DEAL_STAGES] } },
				orderBy: [
					{ baseAmount: { sort: "desc", nulls: "last" } },
					{ expectedCloseDate: "asc" },
				],
				take: 6,
				select: {
					id: true,
					name: true,
					stage: true,
					amount: true,
					currency: true,
					baseAmount: true,
					baseCurrency: true,
					expectedCloseDate: true,
					stageChangedAt: true,
					company: {
						select: {
							id: true,
							name: true,
							iconUrl: true,
							iconDarkUrl: true,
							iconTone: true,
						},
					},
					owner: { select: OWNER_SELECT },
				},
			}),
			this.db.activity.findMany({
				where: {
					type: ActivityType.TASK,
					completedAt: null,
					dueAt: { lt: now },
					createdById: actingUserId,
				},
				orderBy: [{ dueAt: "asc" }],
				take: 10,
				select: {
					id: true,
					subject: true,
					dueAt: true,
					company: { select: { id: true, name: true } },
					deal: { select: { id: true, name: true } },
				},
			}),
			this.db.activity.findMany({
				where: mine ? { createdById: actingUserId } : {},
				orderBy: [{ createdAt: "desc" }],
				take: 12,
				select: {
					id: true,
					type: true,
					subject: true,
					body: true,
					createdAt: true,
					meta: true,
					createdBy: { select: OWNER_SELECT },
					company: { select: { id: true, name: true } },
					deal: { select: { id: true, name: true } },
				},
			}),
			this.conversion.unconverted(owned),
		]);

		const stages = OPEN_DEAL_STAGES.map((stage) => {
			const group = openByStage.find((row) => row.stage === stage);
			const value = openValueByStage.find((row) => row.stage === stage);
			return {
				stage: stage as DealStage,
				count: group?._count._all ?? 0,
				valueCents: toCents(value?._sum.baseAmount ?? null) ?? 0,
			};
		});

		const firstBucket = monthKey(trendStart);
		const trend = Array.from(
			{ length: DASHBOARD.sales.trendMonths },
			(_, index) => ({
				month: MONTH_LABEL.format(monthStart(trendStart, index)),
				won: 0,
				created: 0,
			}),
		);

		const wonThisMonth = { count: 0, valueCents: 0 };
		const wonPrevMonth = { count: 0, valueCents: 0 };
		let wins = 0;
		let losses = 0;
		let valuedWins = 0;
		let wonCents = 0;
		let cycleDays = 0;

		for (const deal of recentDeals) {
			const valued =
				deal.baseCurrency === base ? toCents(deal.baseAmount) : null;
			const cents = valued ?? 0;

			const created = trend[monthKey(deal.createdAt) - firstBucket];
			if (created) created.created += cents;

			const { closedAt, stage } = deal;
			if (!closedAt) continue;
			const won = stage === DealStage.CLOSED_WON;

			if (won) {
				const closed = trend[monthKey(closedAt) - firstBucket];
				if (closed) closed.won += cents;

				if (closedAt >= startOfMonth && closedAt < startOfNextMonth) {
					wonThisMonth.count += 1;
					wonThisMonth.valueCents += cents;
				} else if (closedAt >= startOfPrevMonth && closedAt < startOfMonth) {
					wonPrevMonth.count += 1;
					wonPrevMonth.valueCents += cents;
				}
			}

			if (closedAt < rateStart) continue;
			if (won) {
				wins += 1;
				if (valued !== null) {
					valuedWins += 1;
					wonCents += cents;
				}
				cycleDays +=
					(closedAt.getTime() - deal.createdAt.getTime()) / DASHBOARD.dayMs;
			} else if (stage === DealStage.CLOSED_LOST) {
				losses += 1;
			}
		}

		const decided = wins + losses;

		return {
			scope: input.scope,
			reportingCurrency: base,
			unconverted,
			pipeline: {
				stages,
				totalCents: stages.reduce((total, s) => total + s.valueCents, 0),
				totalDeals: stages.reduce((total, s) => total + s.count, 0),
			},
			wonThisMonth,
			wonPrevMonth,
			performance: {
				windowDays: DASHBOARD.sales.rateWindowDays,
				wins,
				losses,
				winRate: decided === 0 ? null : wins / decided,
				avgDealCents:
					valuedWins === 0 ? null : Math.round(wonCents / valuedWins),
				avgCycleDays: wins === 0 ? null : Math.round(cycleDays / wins),
			},
			trend,
			closingThisMonthTotal: {
				count: closingThisMonthTotals._count._all,
				valueCents: toCents(closingThisMonthTotals._sum.baseAmount) ?? 0,
			},
			biggestOpen: biggestOpen
				.map(
					({
						amount,
						baseAmount,
						baseCurrency,
						expectedCloseDate,
						stageChangedAt,
						...deal
					}) => ({
						...deal,
						amountCents: toCents(amount),
						baseAmountCents: baseCurrency === base ? toCents(baseAmount) : null,
						expectedCloseDate: expectedCloseDate?.toISOString() ?? null,
						stageChangedAt: stageChangedAt.toISOString(),
					}),
				)
				.sort((a, b) => (b.baseAmountCents ?? -1) - (a.baseAmountCents ?? -1)),
			overdueTasks: overdueTasks.map(({ dueAt, ...task }) => ({
				...task,
				dueAt: dueAt?.toISOString() ?? null,
			})),
			recentActivity: recentActivity.map(({ createdAt, meta, ...entry }) => ({
				...entry,
				createdAt: createdAt.toISOString(),
				meta: activityMeta.parse(meta),
			})),
		};
	}

	async leadOverview(actingUserId: string, input: DashboardSummaryInput) {
		const now = new Date();
		const today = startOfUtcDay(now);
		const trendStart = addDays(today, -(DASHBOARD.leads.trendDays - 1));
		const thisWeekStart = addDays(today, -6);
		const previousWeekStart = addDays(thisWeekStart, -7);
		const staleBefore = new Date(
			now.getTime() - DASHBOARD.leads.staleDays * DASHBOARD.dayMs,
		);
		const owned = input.scope === "me" ? { ownerId: actingUserId } : {};
		const leadWhere: Prisma.LeadWhereInput = {
			...owned,
			archivedAt: null,
		};
		const needsAttentionWhere: Prisma.LeadWhereInput = {
			...leadWhere,
			stage: { in: [...ACTIVE_LEAD_STAGES] },
			OR: [
				{ lastActivityAt: { lt: staleBefore } },
				{ lastActivityAt: null, createdAt: { lt: staleBefore } },
			],
		};

		const [
			stageGroups,
			sourceGroups,
			entityGroups,
			createdLeads,
			newThisWeek,
			newPreviousWeek,
			needsAttention,
			priorityLeads,
			overdueTasks,
			recentUpdates,
		] = await Promise.all([
			this.db.lead.groupBy({
				by: ["stage"],
				where: leadWhere,
				_count: { _all: true },
			}),
			this.db.lead.groupBy({
				by: ["source"],
				where: leadWhere,
				_count: { _all: true },
			}),
			this.db.lead.groupBy({
				by: ["entity"],
				where: leadWhere,
				_count: { _all: true },
			}),
			this.db.lead.findMany({
				where: { ...leadWhere, createdAt: { gte: trendStart } },
				select: { createdAt: true },
			}),
			this.db.lead.count({
				where: { ...leadWhere, createdAt: { gte: thisWeekStart } },
			}),
			this.db.lead.count({
				where: {
					...leadWhere,
					createdAt: { gte: previousWeekStart, lt: thisWeekStart },
				},
			}),
			this.db.lead.count({ where: needsAttentionWhere }),
			this.db.lead.findMany({
				where: needsAttentionWhere,
				orderBy: [
					{ lastActivityAt: { sort: "asc", nulls: "first" } },
					{ createdAt: "asc" },
				],
				take: DASHBOARD.leads.priorityLimit,
				select: {
					id: true,
					name: true,
					companyName: true,
					stage: true,
					source: true,
					lastActivityAt: true,
					stageChangedAt: true,
					owner: { select: { id: true, name: true, image: true } },
				},
			}),
			this.db.activity.findMany({
				where: {
					type: ActivityType.TASK,
					completedAt: null,
					dueAt: { lt: now },
					lead: { is: leadWhere },
				},
				orderBy: { dueAt: "asc" },
				take: DASHBOARD.leads.overdueTaskLimit,
				select: {
					id: true,
					subject: true,
					dueAt: true,
					lead: { select: { id: true, name: true } },
				},
			}),
			this.db.activity.findMany({
				where: { lead: { is: leadWhere } },
				orderBy: { createdAt: "desc" },
				take: DASHBOARD.leads.recentUpdateLimit,
				select: {
					id: true,
					type: true,
					subject: true,
					body: true,
					createdAt: true,
					createdBy: {
						select: { id: true, name: true, image: true },
					},
					lead: { select: { id: true, name: true, stage: true } },
				},
			}),
		]);

		const stages = LEAD_STAGES.map((stage) => ({
			stage,
			count:
				stageGroups.find((group) => group.stage === stage)?._count._all ?? 0,
		}));
		const total = stages.reduce((sum, stage) => sum + stage.count, 0);
		const active = stages
			.filter((stage) => ACTIVE_LEAD_STAGE_SET.has(stage.stage))
			.reduce((sum, stage) => sum + stage.count, 0);
		const trendCounts = new Map<string, number>();

		for (const lead of createdLeads) {
			const key = dateKey(lead.createdAt);
			trendCounts.set(key, (trendCounts.get(key) ?? 0) + 1);
		}

		const sortedSources = sourceGroups
			.map((group) => ({
				source: group.source?.trim() || "Manual / unknown",
				count: group._count._all,
			}))
			.sort((left, right) => right.count - left.count);
		const visibleSources = sortedSources.slice(0, DASHBOARD.leads.sourceLimit);
		const otherSourceCount = sortedSources
			.slice(DASHBOARD.leads.sourceLimit)
			.reduce((sum, source) => sum + source.count, 0);

		return {
			scope: input.scope,
			totals: {
				all: total,
				active,
				unassigned:
					stages.find((stage) => stage.stage === LeadStage.UNASSIGNED)?.count ??
					0,
				needsAttention,
				newThisWeek,
				newPreviousWeek,
			},
			stages,
			trend: Array.from({ length: DASHBOARD.leads.trendDays }, (_, index) => {
				const date = addDays(trendStart, index);
				const day = dateKey(date);
				return {
					day,
					label: DAY_LABEL.format(date),
					created: trendCounts.get(day) ?? 0,
				};
			}),
			sources: [
				...visibleSources,
				...(otherSourceCount > 0
					? [{ source: "Other", count: otherSourceCount }]
					: []),
			],
			entities: ["INDIA", "GERMANY", null].map((entity) => ({
				entity,
				count:
					entityGroups.find((group) => group.entity === entity)?._count._all ??
					0,
			})),
			priorityLeads: priorityLeads.map((lead) => ({
				...lead,
				lastActivityAt: lead.lastActivityAt?.toISOString() ?? null,
				stageChangedAt: lead.stageChangedAt.toISOString(),
			})),
			overdueTasks: overdueTasks.flatMap((task) =>
				task.lead && task.dueAt
					? [{ ...task, lead: task.lead, dueAt: task.dueAt.toISOString() }]
					: [],
			),
			recentUpdates: recentUpdates.flatMap((update) =>
				update.lead
					? [
							{
								...update,
								lead: update.lead,
								createdAt: update.createdAt.toISOString(),
							},
						]
					: [],
			),
		};
	}
}

function startOfUtcDay(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * DASHBOARD.dayMs);
}

function dateKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}
