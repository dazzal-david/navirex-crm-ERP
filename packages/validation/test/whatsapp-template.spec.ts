import { describe, expect, it } from "bun:test";
import {
	buildTemplateComponents,
	templateFields,
	unsupportedTemplateReason,
} from "../src/whatsapp-template";

describe("WhatsApp template fields", () => {
	it("uses parameter names for named templates", () => {
		const components = [
			{
				type: "BODY",
				text: "Hi {{first_name}}",
				example: {
					body_text_named_params: [
						{ param_name: "first_name", example: "Asha" },
					],
				},
			},
		];

		expect(buildTemplateComponents(components, {}, null)).toEqual([
			{
				type: "body",
				parameters: [
					{ type: "text", text: "Asha", parameter_name: "first_name" },
				],
			},
		]);
	});

	it("sends a coupon code and a flow button", () => {
		const components = [
			{ type: "BODY", text: "Your offer" },
			{
				type: "BUTTONS",
				buttons: [
					{ type: "COPY_CODE", example: ["SAVE10"] },
					{ type: "FLOW", text: "Book" },
				],
			},
		];

		expect(buildTemplateComponents(components, {}, null)).toEqual([
			{
				type: "button",
				sub_type: "copy_code",
				index: "0",
				parameters: [{ type: "coupon_code", coupon_code: "SAVE10" }],
			},
			{
				type: "button",
				sub_type: "flow",
				index: "1",
				parameters: [{ type: "action", action: { flow_token: "unused" } }],
			},
		]);
	});

	it("needs nothing for a template with only static parts", () => {
		const components = [
			{ type: "BODY", text: "Thanks for contacting Navirex" },
			{ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Yes" }] },
		];

		expect(templateFields(components)).toEqual([]);
		expect(buildTemplateComponents(components, {}, null)).toEqual([]);
	});

	it("names the blank that has no value and no example", () => {
		expect(() =>
			buildTemplateComponents([{ type: "BODY", text: "Hi {{1}}" }], {}, null),
		).toThrow("Fill in Message {{1}}.");
	});

	it("explains a template the CRM cannot send", () => {
		expect(
			unsupportedTemplateReason([{ type: "HEADER", format: "LOCATION" }]),
		).toContain("location header");
	});
});
