import { whatsappTemplateComponents } from "@crm/validation/whatsapp-template";
import { z } from "zod";

export const metaTemplate = z.object({
	id: z.string(),
	name: z.string(),
	language: z.string(),
	status: z.string(),
	category: z.string().optional(),
	components: whatsappTemplateComponents.optional(),
});

export type MetaTemplate = z.infer<typeof metaTemplate>;

export function templateParts(
	template: Pick<MetaTemplate, "name" | "components">,
) {
	const component = (type: string) =>
		template.components?.find((item) => item.type.toUpperCase() === type);
	const header = component("HEADER");
	return {
		body: component("BODY")?.text ?? `Meta template: ${template.name}`,
		headerFormat: header?.format?.toUpperCase() ?? null,
		headerText: header?.text ?? null,
		headerMediaUrl: header?.example?.header_handle?.[0] ?? null,
		footer: component("FOOTER")?.text ?? null,
		components: template.components ?? [],
	};
}
