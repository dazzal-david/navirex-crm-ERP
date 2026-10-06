import type { LeadStage } from "@crm/db";

export const LEADS = {
	board: { columnLimit: 100 },
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
