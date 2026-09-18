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
	directoryOutput,
	employeePortalOutput,
	employeeProfileOutput,
	reimbursementIdInput,
	reimbursementOutput,
	reimbursementsOutput,
	reviewReimbursementInput,
	submitReimbursementInput,
	updateEmployeeInput,
	updateMyProfileInput,
} from "./people.contracts";
import { PeopleService } from "./people.service";

@Router({ alias: "people" })
@UseMiddlewares(AuthMiddleware)
export class PeopleRouter {
	constructor(@Inject(PeopleService) private readonly people: PeopleService) {}

	@Query({ output: employeePortalOutput })
	me(@Ctx() ctx: AuthedTrpcContext) {
		return this.people.me(ctx.user.id);
	}

	@Query({ output: directoryOutput })
	directory(@Ctx() ctx: AuthedTrpcContext) {
		return this.people.directory(ctx.user.id);
	}

	@Mutation({ input: updateMyProfileInput, output: employeeProfileOutput })
	updateMyProfile(
		@Input() input: z.infer<typeof updateMyProfileInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.people.updateMyProfile(input, ctx.user.id);
	}

	@Mutation({ input: updateEmployeeInput, output: employeeProfileOutput })
	updateEmployee(
		@Input() input: z.infer<typeof updateEmployeeInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.people.updateEmployee(input, ctx.user.id);
	}

	@Query({ output: reimbursementsOutput })
	myReimbursements(@Ctx() ctx: AuthedTrpcContext) {
		return this.people.myReimbursements(ctx.user.id);
	}

	@Query({ output: reimbursementsOutput })
	reimbursements(@Ctx() ctx: AuthedTrpcContext) {
		return this.people.reimbursements(ctx.user.id);
	}

	@Mutation({ input: submitReimbursementInput, output: reimbursementOutput })
	submitReimbursement(
		@Input() input: z.infer<typeof submitReimbursementInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.people.submit(input, ctx.user.id);
	}

	@Mutation({ input: reviewReimbursementInput, output: reimbursementOutput })
	reviewReimbursement(
		@Input() input: z.infer<typeof reviewReimbursementInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.people.review(input, ctx.user.id);
	}

	@Mutation({ input: reimbursementIdInput, output: reimbursementOutput })
	markReimbursementPaid(
		@Input() input: z.infer<typeof reimbursementIdInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.people.markPaid(input.id, ctx.user.id);
	}
}
