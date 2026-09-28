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
import {
	invitationIdInput,
	invitationOutput,
	invitationsOutput,
	inviteInput,
	inviteOutput,
	removeMemberInput,
	removeMemberOutput,
} from "./invitations.contracts";
import { InvitationsService } from "./invitations.service";

@Router({ alias: "invitations" })
@UseMiddlewares(AuthMiddleware)
export class InvitationsRouter {
	constructor(
		@Inject(InvitationsService)
		private readonly invitations: InvitationsService,
	) {}

	@Query({ output: invitationsOutput })
	list(@Ctx() ctx: AuthedTrpcContext) {
		return this.invitations.list(ctx.user.id);
	}

	@Mutation({ input: inviteInput, output: inviteOutput })
	invite(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof inviteInput>,
	) {
		return this.invitations.invite(ctx.user.id, input);
	}

	@Mutation({ input: invitationIdInput, output: invitationOutput })
	revoke(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof invitationIdInput>,
	) {
		return this.invitations.revoke(ctx.user.id, input.id);
	}

	@Mutation({ input: removeMemberInput, output: removeMemberOutput })
	removeMember(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof removeMemberInput>,
	) {
		return this.invitations.removeMember(ctx.user.id, input.memberId);
	}
}
