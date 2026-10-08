type TitledLead = {
	name: string;
	companyName: string | null;
	kind: "EPC" | "CUSTOMER" | "OTHER";
	contacts?: { name: string }[];
};

export function leadTitle(lead: TitledLead) {
	if (lead.kind !== "CUSTOMER" && lead.companyName) {
		return {
			title: lead.companyName,
			subtitle: [
				lead.name,
				...(lead.contacts ?? []).map((person) => person.name),
			].join(" · "),
		};
	}
	return { title: lead.name, subtitle: lead.companyName };
}
