import { describe, expect, it } from "bun:test";
import { CommunicationsService } from "../src/communications/communications.service";
import { graphMessage } from "../src/microsoft/graph-mail.service";

const communications = new CommunicationsService(
	{} as never,
	{} as never,
	{} as never,
	{ get: () => undefined } as never,
);

describe("email attachments", () => {
	it("sends files to Microsoft Graph as file attachments", () => {
		const message = graphMessage("lead@example.test", "Quote", "Hello", [
			{
				name: "quote.pdf",
				mimeType: "application/pdf",
				content: Buffer.from("pdf"),
			},
		]);

		expect(message.attachments).toEqual([
			{
				"@odata.type": "#microsoft.graph.fileAttachment",
				name: "quote.pdf",
				contentType: "application/pdf",
				contentBytes: Buffer.from("pdf").toString("base64"),
			},
		]);
	});

	it("refuses attachments over the total size limit before sending", async () => {
		const big = Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64");

		await expect(
			communications.sendEmail(
				{
					leadId: "any",
					subject: "Quote",
					body: "Hello",
					attachments: [
						{
							name: "big.pdf",
							mimeType: "application/pdf",
							contentBase64: big,
						},
					],
				},
				"user",
			),
		).rejects.toThrow("The attachments are too large");
	});
});
