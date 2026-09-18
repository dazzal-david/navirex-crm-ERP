export const LEAD_BOARD = {
	entities: ["INDIA", "GERMANY"],
	kinds: ["EPC", "CUSTOMER", "OTHER"],
	stages: [
		"UNASSIGNED",
		"ASSIGNED",
		"TALKING",
		"INTERESTED",
		"REJECTED",
		"APPROVED",
	],
	label: {
		UNASSIGNED: "Unassigned",
		ASSIGNED: "Assigned",
		TALKING: "Talking",
		INTERESTED: "Interested",
		REJECTED: "Rejected",
		APPROVED: "Approved",
	},
	kind: {
		EPC: "EPC",
		CUSTOMER: "Customer",
		OTHER: "Other",
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
