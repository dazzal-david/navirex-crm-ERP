import { z } from "zod";

const namedExample = z.object({ param_name: z.string(), example: z.string() });

export const whatsappTemplateButton = z.object({
	type: z.string(),
	text: z.string().optional(),
	url: z.string().optional(),
	example: z.array(z.string()).optional(),
});

export const whatsappTemplateComponent = z.object({
	type: z.string(),
	format: z.string().optional(),
	text: z.string().optional(),
	example: z
		.object({
			header_handle: z.array(z.string()).optional(),
			header_text: z.array(z.string()).optional(),
			header_text_named_params: z.array(namedExample).optional(),
			body_text: z.array(z.array(z.string())).optional(),
			body_text_named_params: z.array(namedExample).optional(),
		})
		.optional(),
	buttons: z.array(whatsappTemplateButton).optional(),
});

export const whatsappTemplateComponents = z.array(whatsappTemplateComponent);

export type WhatsAppTemplateComponent = z.infer<
	typeof whatsappTemplateComponent
>;

export type WhatsAppTemplateField = {
	key: string;
	section: "header" | "body" | "button";
	label: string;
	example: string;
	parameterName: string | null;
	buttonIndex: number | null;
	buttonSubType: "url" | "copy_code" | null;
};

export type WhatsAppHeaderMedia = {
	kind: "image" | "video" | "document";
	sampleUrl: string | null;
};

export type WhatsAppHeaderMediaSource = { id: string } | { link: string };

type TextParameter = { type: "text"; text: string; parameter_name?: string };

export type WhatsAppSendParameter =
	| TextParameter
	| { type: "image"; image: WhatsAppHeaderMediaSource }
	| { type: "video"; video: WhatsAppHeaderMediaSource }
	| { type: "document"; document: WhatsAppHeaderMediaSource }
	| { type: "coupon_code"; coupon_code: string }
	| { type: "action"; action: { flow_token: string } };

export type WhatsAppSendComponent =
	| { type: "header" | "body"; parameters: WhatsAppSendParameter[] }
	| {
			type: "button";
			sub_type: "url" | "copy_code" | "flow";
			index: string;
			parameters: WhatsAppSendParameter[];
	  };

const UNSUPPORTED_HEADERS = ["LOCATION"];
const UNSUPPORTED_COMPONENTS = ["CAROUSEL", "LIMITED_TIME_OFFER"];
const FLOW_TOKEN = "unused";

export function templatePlaceholders(text: string | undefined): string[] {
	return [
		...new Set(
			Array.from(
				(text ?? "").matchAll(/{{\s*([\w]+)\s*}}/g),
				(match) => match[1] ?? "",
			),
		),
	].filter(Boolean);
}

function componentOf(
	components: WhatsAppTemplateComponent[],
	type: string,
): WhatsAppTemplateComponent | undefined {
	return components.find((component) => component.type.toUpperCase() === type);
}

function isNamed(placeholder: string): boolean {
	return !/^\d+$/.test(placeholder);
}

function exampleFor(
	placeholder: string,
	index: number,
	positional: string[] | undefined,
	named: { param_name: string; example: string }[] | undefined,
): string {
	if (isNamed(placeholder)) {
		return (
			named?.find((item) => item.param_name === placeholder)?.example ?? ""
		);
	}
	return positional?.[index] ?? "";
}

function buttonExample(button: z.infer<typeof whatsappTemplateButton>): string {
	const sample = button.example?.[0] ?? "";
	const prefix = button.url?.split("{{")[0] ?? "";
	return prefix && sample.startsWith(prefix)
		? sample.slice(prefix.length)
		: sample;
}

export function templateHeaderMedia(
	components: WhatsAppTemplateComponent[],
): WhatsAppHeaderMedia | null {
	const header = componentOf(components, "HEADER");
	const format = header?.format?.toUpperCase();
	if (format !== "IMAGE" && format !== "VIDEO" && format !== "DOCUMENT") {
		return null;
	}
	return {
		kind:
			format === "IMAGE" ? "image" : format === "VIDEO" ? "video" : "document",
		sampleUrl: header?.example?.header_handle?.[0] ?? null,
	};
}

export function templateFields(
	components: WhatsAppTemplateComponent[],
): WhatsAppTemplateField[] {
	const fields: WhatsAppTemplateField[] = [];

	const header = componentOf(components, "HEADER");
	if (header?.format?.toUpperCase() === "TEXT") {
		templatePlaceholders(header.text).forEach((placeholder, index) => {
			fields.push({
				key: `header:${placeholder}`,
				section: "header",
				label: `Header {{${placeholder}}}`,
				example: exampleFor(
					placeholder,
					index,
					header.example?.header_text,
					header.example?.header_text_named_params,
				),
				parameterName: isNamed(placeholder) ? placeholder : null,
				buttonIndex: null,
				buttonSubType: null,
			});
		});
	}

	const body = componentOf(components, "BODY");
	templatePlaceholders(body?.text).forEach((placeholder, index) => {
		fields.push({
			key: `body:${placeholder}`,
			section: "body",
			label: `Message {{${placeholder}}}`,
			example: exampleFor(
				placeholder,
				index,
				body?.example?.body_text?.[0],
				body?.example?.body_text_named_params,
			),
			parameterName: isNamed(placeholder) ? placeholder : null,
			buttonIndex: null,
			buttonSubType: null,
		});
	});

	const buttons = componentOf(components, "BUTTONS")?.buttons ?? [];
	buttons.forEach((button, buttonIndex) => {
		const type = button.type.toUpperCase();
		if (type === "URL" && button.url?.includes("{{")) {
			fields.push({
				key: `button:${buttonIndex}`,
				section: "button",
				label: `Link for button “${button.text ?? buttonIndex + 1}”`,
				example: buttonExample(button),
				parameterName: null,
				buttonIndex,
				buttonSubType: "url",
			});
		}
		if (type === "COPY_CODE") {
			fields.push({
				key: `button:${buttonIndex}`,
				section: "button",
				label: "Coupon code",
				example: button.example?.[0] ?? "",
				parameterName: null,
				buttonIndex,
				buttonSubType: "copy_code",
			});
		}
	});

	return fields;
}

export function unsupportedTemplateReason(
	components: WhatsAppTemplateComponent[],
): string | null {
	const header = componentOf(components, "HEADER");
	if (UNSUPPORTED_HEADERS.includes(header?.format?.toUpperCase() ?? "")) {
		return "Templates with a location header cannot be sent from the CRM yet.";
	}
	const unsupported = components.find((component) =>
		UNSUPPORTED_COMPONENTS.includes(component.type.toUpperCase()),
	);
	return unsupported
		? `Templates with a ${unsupported.type.toLowerCase().replaceAll("_", " ")} cannot be sent from the CRM yet.`
		: null;
}

function textParameter(
	field: WhatsAppTemplateField,
	text: string,
): TextParameter {
	return field.parameterName
		? { type: "text", text, parameter_name: field.parameterName }
		: { type: "text", text };
}

export function buildTemplateComponents(
	components: WhatsAppTemplateComponent[],
	values: Record<string, string>,
	headerMedia: WhatsAppHeaderMediaSource | null,
): WhatsAppSendComponent[] {
	const reason = unsupportedTemplateReason(components);
	if (reason) throw new Error(reason);

	const fields = templateFields(components);
	const fieldValue = (field: WhatsAppTemplateField) =>
		(values[field.key] ?? "").trim() || field.example.trim();
	const missing = fields.filter((field) => !fieldValue(field));
	if (missing.length > 0) {
		throw new Error(
			`Fill in ${missing.map((field) => field.label).join(", ")}.`,
		);
	}

	const result: WhatsAppSendComponent[] = [];

	const media = templateHeaderMedia(components);
	if (media) {
		if (!headerMedia) {
			throw new Error(
				`This template needs a header ${media.kind}. Sync templates again or attach one.`,
			);
		}
		const parameter: WhatsAppSendParameter =
			media.kind === "image"
				? { type: "image", image: headerMedia }
				: media.kind === "video"
					? { type: "video", video: headerMedia }
					: { type: "document", document: headerMedia };
		result.push({ type: "header", parameters: [parameter] });
	}

	const headerFields = fields.filter((field) => field.section === "header");
	if (headerFields.length > 0) {
		result.push({
			type: "header",
			parameters: headerFields.map((field) =>
				textParameter(field, fieldValue(field)),
			),
		});
	}

	const bodyFields = fields.filter((field) => field.section === "body");
	if (bodyFields.length > 0) {
		result.push({
			type: "body",
			parameters: bodyFields.map((field) =>
				textParameter(field, fieldValue(field)),
			),
		});
	}

	for (const field of fields) {
		if (field.section !== "button" || field.buttonIndex === null) continue;
		result.push({
			type: "button",
			sub_type: field.buttonSubType === "copy_code" ? "copy_code" : "url",
			index: String(field.buttonIndex),
			parameters: [
				field.buttonSubType === "copy_code"
					? { type: "coupon_code", coupon_code: fieldValue(field) }
					: { type: "text", text: fieldValue(field) },
			],
		});
	}

	const buttons = componentOf(components, "BUTTONS")?.buttons ?? [];
	buttons.forEach((button, index) => {
		if (button.type.toUpperCase() !== "FLOW") return;
		result.push({
			type: "button",
			sub_type: "flow",
			index: String(index),
			parameters: [{ type: "action", action: { flow_token: FLOW_TOKEN } }],
		});
	});

	return result;
}
