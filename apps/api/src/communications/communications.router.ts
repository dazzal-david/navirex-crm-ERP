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
import { NotificationsService } from "../notifications/notifications.service";
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
	leadNotesOutput,
	markReadOutput,
	recipientsOutput,
	sendEmailInput,
	sendMessageOutput,
	sendWhatsAppInput,
	unreadOutput,
	whatsappWindowInput,
	whatsappWindowOutput,
} from "./communications.contracts";
import { CommunicationsService } from "./communications.service";

@Router({ alias: "communications" })
@UseMiddlewares(AuthMiddleware)
export class CommunicationsRouter {
	constructor(
		@Inject(CommunicationsService)
		private readonly communications: CommunicationsService,
		@Inject(NotificationsService)
		private readonly notifications: NotificationsService,
	) {}

	@Query({
		output: communicationStatusOutput,
		meta: restMeta("GET", "/communications/status", ["Communications"]),
	})
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.communications.status(ctx.user.id);
	}

	@Query({ output: conversationsOutput })
	conversations(@Ctx() ctx: AuthedTrpcContext) {
		return this.communications.conversations(ctx.user.id);
	}

	@Query({ output: unreadOutput })
	unread(@Ctx() ctx: AuthedTrpcContext) {
		return this.communications.unread(ctx.user.id);
	}

	@Mutation({ input: conversationInput, output: markReadOutput })
	markRead(
		@Input() input: z.infer<typeof conversationInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.communications.markRead(input.leadId, ctx.user.id);
	}

	@Query({ input: conversationInput, output: leadNotesOutput })
	notes(@Input() input: z.infer<typeof conversationInput>) {
		return this.communications.notes(input.leadId);
	}

	@Query({ input: conversationInput, output: conversationOutput })
	conversation(@Input() input: z.infer<typeof conversationInput>) {
		return this.communications.conversation(input.leadId);
	}

	@Query({ input: whatsappWindowInput, output: whatsappWindowOutput })
	whatsappWindow(@Input() input: z.infer<typeof whatsappWindowInput>) {
		return this.communications.whatsappWindow(input.leadId, input.contactId);
	}

	@Query({ input: conversationInput, output: recipientsOutput })
	recipients(@Input() input: z.infer<typeof conversationInput>) {
		return this.communications.recipients(input.leadId);
	}

	@Mutation({ input: addNoteInput, output: addNoteOutput })
	async addNote(
		@Input() input: z.infer<typeof addNoteInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		const note = await this.communications.addNote(input, ctx.user.id);
		await this.notifications.notifyMentions({
			actorId: ctx.user.id,
			mentionIds: input.mentions,
			leadId: input.leadId,
			activityId: note.id,
			text: input.body,
		});
		return note;
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
