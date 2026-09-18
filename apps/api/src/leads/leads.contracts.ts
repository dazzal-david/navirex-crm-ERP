import { z } from "zod";

export const LEAD_STAGES = [
	"UNASSIGNED",
	"ASSIGNED",
	"TALKING",
	"INTERESTED",
	"REJECTED",
	"APPROVED",
] as const;

export const LEAD_KINDS = ["EPC", "CUSTOMER", "OTHER"] as const;

export const NAVIREX_ENTITIES = ["INDIA", "GERMANY"] as const;

export const leadStage = z.enum(LEAD_STAGES);
export const leadKind = z.enum(LEAD_KINDS);
export const navirexEntity = z.enum(NAVIREX_ENTITIES);

export const leadCard = z.object({
	id: z.string(),
	name: z.string(),
	companyName: z.string().nullable(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	kind: leadKind,
	entity: navirexEntity.nullable(),
	stage: leadStage,
	position: z.number(),
	source: z.string().nullable(),
	country: z.string().nullable(),
	rejectedReason: z.string().nullable(),
	owner: z
		.object({
			id: z.string(),
			name: z.string(),
			image: z.string().nullable(),
			designation: z.string().nullable(),
		})
		.nullable(),
	lastActivityAt: z.date().nullable(),
	createdAt: z.date(),
});

export const boardInput = z.object({
	q: z.string().trim().max(200).optional(),
	entity: navirexEntity.optional(),
	kind: leadKind.optional(),
	ownerId: z.string().optional(),
	mine: z.boolean().optional(),
});

export const boardColumn = z.object({
	stage: leadStage,
	total: z.number(),
	leads: z.array(leadCard),
});

export const columnPageInput = boardInput.extend({
	stage: leadStage,
	cursor: z.number().int().optional(),
});

export const columnPageOutput = z.object({
	leads: z.array(leadCard),
	nextCursor: z.number().int().nullable(),
});

export const boardOutput = z.object({
	columns: z.array(boardColumn),
});

export const leadCreateInput = z.object({
	name: z.string().trim().min(1).max(200),
	companyName: z.string().trim().max(200).optional(),
	email: z.email().max(320).optional().or(z.literal("")),
	phone: z.string().trim().max(50).optional(),
	kind: leadKind.default("EPC"),
	entity: navirexEntity.optional(),
	stage: leadStage.default("UNASSIGNED"),
	ownerId: z.string().optional(),
	source: z.string().trim().max(120).optional(),
	country: z.string().trim().max(120).optional(),
	notes: z.string().trim().max(5000).optional(),
});

export const leadIntakeInput = leadCreateInput
	.extend({
		externalId: z.string().trim().max(200).optional(),
	})
	.refine((lead) => Boolean(lead.email || lead.phone), {
		message: "An email address or phone number is required.",
	});

export const leadIntakeOutput = z.object({
	id: z.string(),
	created: z.boolean(),
});

export const zohoLeadRow = leadCreateInput.partial().extend({
	zohoId: z.string().trim().min(1).max(200),
	name: z.string().trim().min(1).max(200),
});

export const zohoImportInput = z.object({
	rows: z.array(zohoLeadRow).min(1).max(2000),
});

export const zohoImportOutput = z.object({
	created: z.number(),
	updated: z.number(),
	failed: z.number(),
	errors: z.array(
		z.object({
			row: z.number(),
			message: z.string(),
		}),
	),
});

export const leadUpdateInput = leadCreateInput
	.partial()
	.extend({ id: z.string() });

export const leadIdInput = z.object({ id: z.string() });

export const leadMoveInput = z.object({
	id: z.string(),
	stage: leadStage,
	beforeId: z.string().nullable().optional(),
	afterId: z.string().nullable().optional(),
});

export const leadAssignInput = z.object({
	id: z.string(),
	ownerId: z.string().nullable(),
});

export const leadDetailOutput = leadCard.extend({
	notes: z.string().nullable(),
	zohoId: z.string().nullable(),
	stageChangedAt: z.date(),
	updatedAt: z.date(),
});

export const leadMutateOutput = leadCard;

export const leadDeleteOutput = z.object({ id: z.string() });

export const leadOwnersOutput = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		email: z.string(),
		image: z.string().nullable(),
		designation: z.string().nullable(),
	}),
);

export type LeadCard = z.infer<typeof leadCard>;
export type BoardInput = z.infer<typeof boardInput>;
export type BoardOutput = z.infer<typeof boardOutput>;
export type LeadCreateInput = z.infer<typeof leadCreateInput>;
export type LeadIntakeInput = z.infer<typeof leadIntakeInput>;
export type ZohoLeadRow = z.infer<typeof zohoLeadRow>;
export type LeadUpdateInput = z.infer<typeof leadUpdateInput>;
export type LeadMoveInput = z.infer<typeof leadMoveInput>;
export type LeadStage = z.infer<typeof leadStage>;
export type ColumnPageInput = z.infer<typeof columnPageInput>;
export type ColumnPageOutput = z.infer<typeof columnPageOutput>;
