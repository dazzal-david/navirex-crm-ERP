export function workspaceLabel(name: string | undefined): string {
	const trimmed = name?.trim();

	if (!trimmed || /^crm$/i.test(trimmed)) return "Navirex CRM";

	return /\bcrm$/i.test(trimmed) ? trimmed : `${trimmed} CRM`;
}
