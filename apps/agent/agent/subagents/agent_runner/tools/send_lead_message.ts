import { defineTool } from "eve/tools";
import { z } from "zod";
import { sendRunLeadMessage } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Send one approved email or WhatsApp template to an approved lead. The deployed version pins the exact template content and the delivery is idempotent across retries.",
	inputSchema: z.object({
		leadId: z.string().min(1),
		templateId: z.string().min(1),
	}),
	async execute(input, ctx) {
		return sendRunLeadMessage(
			requireTeamAgentAttribute(ctx, "runId"),
			ctx.callId,
			input,
		);
	},
});
