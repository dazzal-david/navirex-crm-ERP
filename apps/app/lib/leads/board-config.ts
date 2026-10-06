export const LEAD_BOARD = {
	entities: ["INDIA", "GERMANY"],
	kinds: ["EPC", "CUSTOMER", "OTHER"],
	stages: [
		"NOT_CONTACTED",
		"CONTACTED",
		"FOLLOW_UP",
		"ONBOARDED",
		"NOT_INTERESTED",
		"NOT_QUALIFIED",
	],
	label: {
		NOT_CONTACTED: "Not contacted",
		CONTACTED: "Contacted",
		FOLLOW_UP: "Follow-up",
		ONBOARDED: "Onboarded",
		NOT_INTERESTED: "Not interested",
		NOT_QUALIFIED: "Not qualified",
	},
	kind: {
		EPC: "EPC",
		CUSTOMER: "Customer",
		OTHER: "Other",
	},
	designationKinds: ["EPC", "OTHER"],
	portalStatus: {
		NOT_REGISTERED: "Not registered",
		REGISTERED: "Registered",
	},
	entity: {
		INDIA: "IN",
		GERMANY: "DE",
	},
	entityName: {
		INDIA: "Navirex India",
		GERMANY: "Navirex Germany",
	},
	filter: {
		all: "__all__",
		mine: "__mine__",
		ownerPrefix: "owner:",
	},
	pointerDragThresholdPx: 5,
} as const;
