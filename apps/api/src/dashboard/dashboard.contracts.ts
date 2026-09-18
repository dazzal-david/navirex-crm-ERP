import { ActivityType, DealStage, LeadStage, NavirexEntity } from "@crm/db";
import { activityMeta } from "@crm/validation/activity-meta";
import { z } from "zod";

const DASHBOARD_SCOPES = ["me", "everyone"] as const;

export const dashboardSummaryInput = z.object({
	scope: z.enum(DASHBOARD_SCOPES).default("me"),
});

export const leadDashboardInput = dashboardSummaryInput;

export type DashboardSummaryInput = z.infer<typeof dashboardSummaryInput>;

const stageEnum = z.enum(
	Object.values(DealStage) as [DealStage, ...DealStage[]],
);

const ownerOutput = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

const companyBriefOutput = z.object({
	id: z.string(),
	name: z.string(),
	iconUrl: z.string().nullable(),
	iconDarkUrl: z.string().nullable(),
	iconTone: z.string().nullable(),
});

const linkedRecordOutput = z.object({ id: z.string(), name: z.string() });

const monthlyTotalOutput = z.object({
	count: z.number(),
	valueCents: z.number(),
});

const stageBucketOutput = z.object({
	stage: stageEnum,
	count: z.number(),
	valueCents: z.number(),
});

const trendPointOutput = z.object({
	month: z.string(),
	won: z.number(),
	created: z.number(),
});

const unconvertedOutput = z.object({
	count: z.number(),
	currencies: z.array(z.string()),
});

const biggestOpenDealOutput = z.object({
	id: z.string(),
	name: z.string(),
	stage: stageEnum,
	currency: z.string(),
	company: companyBriefOutput,
	owner: ownerOutput,
	amountCents: z.number().nullable(),
	baseAmountCents: z.number().nullable(),
	expectedCloseDate: z.string().nullable(),
	stageChangedAt: z.string(),
});

const overdueTaskOutput = z.object({
	id: z.string(),
	subject: z.string().nullable(),
	company: linkedRecordOutput.nullable(),
	deal: linkedRecordOutput.nullable(),
	dueAt: z.string().nullable(),
});

const recentActivityOutput = z.object({
	id: z.string(),
	type: z.nativeEnum(ActivityType),
	subject: z.string().nullable(),
	body: z.string().nullable(),
	createdBy: ownerOutput,
	company: linkedRecordOutput.nullable(),
	deal: linkedRecordOutput.nullable(),
	createdAt: z.string(),
	meta: activityMeta,
});

export const dashboardSummaryOutput = z.object({
	scope: z.enum(DASHBOARD_SCOPES),
	reportingCurrency: z.string(),
	unconverted: unconvertedOutput,
	pipeline: z.object({
		stages: z.array(stageBucketOutput),
		totalCents: z.number(),
		totalDeals: z.number(),
	}),
	wonThisMonth: monthlyTotalOutput,
	wonPrevMonth: monthlyTotalOutput,
	performance: z.object({
		windowDays: z.number(),
		wins: z.number(),
		losses: z.number(),
		winRate: z.number().nullable(),
		avgDealCents: z.number().nullable(),
		avgCycleDays: z.number().nullable(),
	}),
	trend: z.array(trendPointOutput),
	closingThisMonthTotal: monthlyTotalOutput,
	biggestOpen: z.array(biggestOpenDealOutput),
	overdueTasks: z.array(overdueTaskOutput),
	recentActivity: z.array(recentActivityOutput),
});

const leadStageOutput = z.nativeEnum(LeadStage);

const leadOwnerOutput = z.object({
	id: z.string(),
	name: z.string(),
	image: z.string().nullable(),
});

const dashboardLeadOutput = z.object({
	id: z.string(),
	name: z.string(),
	companyName: z.string().nullable(),
	stage: leadStageOutput,
	source: z.string().nullable(),
	lastActivityAt: z.string().nullable(),
	stageChangedAt: z.string(),
	owner: leadOwnerOutput.nullable(),
});

export const leadDashboardOutput = z.object({
	scope: z.enum(DASHBOARD_SCOPES),
	totals: z.object({
		all: z.number(),
		active: z.number(),
		unassigned: z.number(),
		needsAttention: z.number(),
		newThisWeek: z.number(),
		newPreviousWeek: z.number(),
	}),
	stages: z.array(
		z.object({
			stage: leadStageOutput,
			count: z.number(),
		}),
	),
	trend: z.array(
		z.object({
			day: z.string(),
			label: z.string(),
			created: z.number(),
		}),
	),
	sources: z.array(
		z.object({
			source: z.string(),
			count: z.number(),
		}),
	),
	entities: z.array(
		z.object({
			entity: z.nativeEnum(NavirexEntity).nullable(),
			count: z.number(),
		}),
	),
	priorityLeads: z.array(dashboardLeadOutput),
	overdueTasks: z.array(
		z.object({
			id: z.string(),
			subject: z.string().nullable(),
			dueAt: z.string(),
			lead: z.object({ id: z.string(), name: z.string() }),
		}),
	),
	recentUpdates: z.array(
		z.object({
			id: z.string(),
			type: z.nativeEnum(ActivityType),
			subject: z.string().nullable(),
			body: z.string().nullable(),
			createdAt: z.string(),
			createdBy: leadOwnerOutput,
			lead: z.object({
				id: z.string(),
				name: z.string(),
				stage: leadStageOutput,
			}),
		}),
	),
});
