type TitledLead = {
	name: string;
	companyName: string | null;
	kind: "EPC" | "CUSTOMER" | "OTHER";
};

export function leadTitle(lead: TitledLead) {
	if (lead.kind !== "CUSTOMER" && lead.companyName) {
		return { title: lead.companyName, subtitle: lead.name };
	}
	return { title: lead.name, subtitle: lead.companyName };
}
