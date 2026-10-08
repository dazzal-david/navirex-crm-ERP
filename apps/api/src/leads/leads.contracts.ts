import { z } from "zod";
import { LEADS } from "./leads-config";

export const LEAD_STAGES = [
	"NOT_CONTACTED",
	"CONTACTED",
	"FOLLOW_UP",
	"ONBOARDED",
	"NOT_INTERESTED",
	"NOT_QUALIFIED",
] as const;

export const LEAD_KINDS = ["EPC", "CUSTOMER", "OTHER"] as const;

export const NAVIREX_ENTITIES = ["INDIA", "GERMANY"] as const;

export const leadStage = z.enum(LEAD_STAGES);
export const leadKind = z.enum(LEAD_KINDS);
export const navirexEntity = z.enum(NAVIREX_ENTITIES);

export const leadCard = z.object({
	id: z.string(),
	name: z.string(),
	designation: z.string().nullable(),
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
	nextAction: z.string().nullable(),
	companyId: z.string().nullable(),
	contactId: z.string().nullable(),
	convertedAt: z.date().nullable(),
	servingEpc: z.object({ id: z.string(), name: z.string() }).nullable(),
	servingEpcName: z.string().nullable(),
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

export const leadListInput = boardInput.extend({
	cursor: z.string().optional(),
	stage: leadStage.optional(),
});

export const leadListOutput = z.object({
	leads: z.array(leadCard),
	total: z.number(),
	nextCursor: z.string().nullable(),
});

export const boardOutput = z.object({
	columns: z.array(boardColumn),
});

const optionalEmail = z.email().max(320).optional().or(z.literal(""));

const leadFields = z.object({
	name: z.string().trim().min(1).max(200),
	designation: z.string().trim().max(200).optional(),
	companyName: z.string().trim().max(200).optional(),
	email: optionalEmail,
	secondaryEmail: optionalEmail,
	phone: z.string().trim().max(50).optional(),
	secondaryPhone: z.string().trim().max(50).optional(),
	website: z.string().trim().max(500).optional(),
	kind: leadKind,
	entity: navirexEntity.optional(),
	stage: leadStage,
	ownerId: z.string().optional(),
	source: z.string().trim().max(120).optional(),
	country: z.string().trim().max(120).optional(),
	state: z.string().trim().max(120).optional(),
	address: z.string().trim().max(1000).optional(),
	nextAction: z.string().trim().max(1000).optional(),
	notes: z.string().trim().max(5000).optional(),
	servingEpcId: z.string().nullable().optional(),
	servingEpcName: z.string().trim().max(200).optional(),
});

export const leadCreateInput = leadFields.extend({
	kind: leadKind.default("EPC"),
	stage: leadStage.default("NOT_CONTACTED"),
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

export const zohoLeadRow = leadFields.partial().extend({
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

export const leadUpdateInput = leadFields.partial().extend({ id: z.string() });

export const leadIdInput = z.object({ id: z.string() });

export const unassignedLeadsInput = z.object({
	cursor: z.string().optional(),
});

export const unassignedLeadsOutput = z.object({
	leads: z.array(leadCard),
	total: z.number().int(),
	nextCursor: z.string().nullable(),
});

export const leadAssignManyInput = z.object({
	ids: z.array(z.string()).min(1).max(LEADS.unassigned.assignLimit),
	ownerId: z.string(),
});

export const leadAssignManyOutput = z.object({ assigned: z.number().int() });

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

export const leadContact = z.object({
	id: z.string(),
	name: z.string(),
	designation: z.string().nullable(),
	phone: z.string().nullable(),
	email: z.string().nullable(),
	createdAt: z.date(),
});

export const leadContactsOutput = z.array(leadContact);

export const leadContactCreateInput = z.object({
	leadId: z.string(),
	name: z.string().trim().min(1).max(200),
	designation: z.string().trim().max(200).optional(),
	phone: z.string().trim().max(50).optional(),
	email: optionalEmail,
});

export const leadContactUpdateInput = leadContactCreateInput
	.omit({ leadId: true })
	.partial()
	.extend({ id: z.string() });

export const leadContactIdInput = z.object({ id: z.string() });

export const leadMergeInput = z.object({
	sourceId: z.string(),
	targetId: z.string(),
});

export const leadIdOnlyOutput = z.object({ leadId: z.string() });

export const sameCompanyOutput = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		companyName: z.string().nullable(),
		stage: leadStage,
		createdAt: z.date(),
		owner: z.object({ id: z.string(), name: z.string() }).nullable(),
	}),
);

export type LeadContactCreateInput = z.infer<typeof leadContactCreateInput>;
export type LeadContactUpdateInput = z.infer<typeof leadContactUpdateInput>;

export const leadDetailOutput = leadCard.extend({
	secondaryPhone: z.string().nullable(),
	secondaryEmail: z.string().nullable(),
	website: z.string().nullable(),
	state: z.string().nullable(),
	address: z.string().nullable(),
	notes: z.string().nullable(),
	zohoId: z.string().nullable(),
	stageChangedAt: z.date(),
	updatedAt: z.date(),
});

export const leadMutateOutput = leadCard;

export const leadConvertOutput = z.object({
	leadId: z.string(),
	companyId: z.string(),
	contactId: z.string(),
	convertedAt: z.date(),
});

export const leadDeleteOutput = z.object({ id: z.string() });

export const leadEpcOptionsOutput = z.array(
	z.object({ id: z.string(), name: z.string() }),
);

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
export type LeadListInput = z.infer<typeof leadListInput>;
export type LeadListOutput = z.infer<typeof leadListOutput>;
