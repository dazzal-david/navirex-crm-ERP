import { Controller, Get, Param } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { InvitationsService } from "./invitations.service";

@Controller("api/invitations")
export class InvitationsController {
	constructor(private readonly invitations: InvitationsService) {}

	@Get(":token")
	@AllowAnonymous()
	lookup(@Param("token") token: string) {
		return this.invitations.lookup(token);
	}
}
