import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	addNoteInput,
	addNoteOutput,
	communicationStatusOutput,
	conversationInput,
	conversationOutput,
	conversationsOutput,
	sendEmailInput,
	sendMessageOutput,
	sendWhatsAppInput,
	whatsappWindowOutput,
} from "./communications.contracts";
import { CommunicationsService } from "./communications.service";

@Router({ alias: "communications" })
@UseMiddlewares(AuthMiddleware)
export class CommunicationsRouter {
	constructor(
		@Inject(CommunicationsService)
		private readonly communications: CommunicationsService,
	) {}

	@Query({
		output: communicationStatusOutput,
		meta: restMeta("GET", "/communications/status", ["Communications"]),
	})
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.communications.status(ctx.user.id);
	}

	@Query({ output: conversationsOutput })
	conversations() {
		return this.communications.conversations();
	}

	@Query({ input: conversationInput, output: conversationOutput })
	conversation(@Input() input: z.infer<typeof conversationInput>) {
		return this.communications.conversation(input.leadId);
	}

	@Query({ input: conversationInput, output: whatsappWindowOutput })
	whatsappWindow(@Input() input: z.infer<typeof conversationInput>) {
		return this.communications.whatsappWindow(input.leadId);
	}

	@Mutation({ input: addNoteInput, output: addNoteOutput })
	addNote(
		@Input() input: z.infer<typeof addNoteInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.communications.addNote(input, ctx.user.id);
	}

	@Mutation({
		input: sendEmailInput,
		output: sendMessageOutput,
		meta: restMeta("POST", "/communications/email", ["Communications"]),
	})
	sendEmail(
		@Input() input: z.infer<typeof sendEmailInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.communications.sendEmail(input, ctx.user.id);
	}

	@Mutation({
		input: sendWhatsAppInput,
		output: sendMessageOutput,
		meta: restMeta("POST", "/communications/whatsapp", ["Communications"]),
	})
	sendWhatsApp(
		@Input() input: z.infer<typeof sendWhatsAppInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.communications.sendWhatsApp(input, ctx.user.id);
	}
}
