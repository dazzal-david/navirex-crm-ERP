import type { LeadStage, Prisma } from "@crm/db";

const ACTIVE_STAGES: LeadStage[] = ["NOT_CONTACTED", "CONTACTED", "FOLLOW_UP"];

export const LEADS = {
	board: { columnLimit: 100 },
	activeStages: ACTIVE_STAGES,
	unassigned: { pageSize: 50, assignLimit: 1000 },
	position: { gap: 1000 },
	stageLabel: {
		NOT_CONTACTED: "Not contacted",
		CONTACTED: "Contacted",
		FOLLOW_UP: "Follow-up",
		ONBOARDED: "Onboarded",
		NOT_INTERESTED: "Not interested",
		NOT_QUALIFIED: "Not qualified",
	} satisfies Record<LeadStage, string>,
	note: {
		subject: "Internal note",
		meta: { channel: "note", direction: "internal" },
	},
} as const;

export function unassignedLeadWhere(): Prisma.LeadWhereInput {
	return {
		archivedAt: null,
		ownerId: null,
		stage: { in: LEADS.activeStages },
	};
}
