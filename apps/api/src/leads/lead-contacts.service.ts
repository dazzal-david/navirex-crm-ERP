import { ActivityType, type Db, type NavirexEntity } from "@crm/db";
import { PHONE, withCountryCode } from "@crm/validation/phone";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	LeadContactCreateInput,
	LeadContactUpdateInput,
} from "./leads.contracts";
import { LEADS } from "./leads-config";

const CONTACT_SELECT = {
	id: true,
	name: true,
	designation: true,
	phone: true,
	email: true,
	createdAt: true,
} as const;

@Injectable()
export class LeadContactsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(leadId: string) {
		return this.db.leadContact.findMany({
			where: { leadId },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			select: CONTACT_SELECT,
		});
	}

	async add(input: LeadContactCreateInput, userId: string) {
		const lead = await this.lead(input.leadId);
		const contact = await this.db.leadContact.create({
			data: {
				leadId: lead.id,
				name: input.name,
				designation: blank(input.designation),
				phone: contactPhone(input.phone, lead.entity),
				email: blank(input.email)?.toLowerCase() ?? null,
			},
			select: CONTACT_SELECT,
		});
		await this.log(lead.id, userId, `Contact added: ${contact.name}.`);
		return contact;
	}

	async update(input: LeadContactUpdateInput) {
		const current = await this.db.leadContact.findUnique({
			where: { id: input.id },
			select: { id: true, lead: { select: { entity: true } } },
		});
		if (!current) throw new NotFoundException("That contact no longer exists.");
		return this.db.leadContact.update({
			where: { id: input.id },
			data: {
				...(input.name !== undefined && { name: input.name }),
				...(input.designation !== undefined && {
					designation: blank(input.designation),
				}),
				...(input.phone !== undefined && {
					phone: contactPhone(input.phone, current.lead.entity),
				}),
				...(input.email !== undefined && {
					email: blank(input.email)?.toLowerCase() ?? null,
				}),
			},
			select: CONTACT_SELECT,
		});
	}

	async remove(id: string, userId: string) {
		const contact = await this.db.leadContact.findUnique({
			where: { id },
			select: { id: true, name: true, leadId: true },
		});
		if (!contact) throw new NotFoundException("That contact no longer exists.");
		await this.db.leadContact.delete({ where: { id } });
		await this.log(contact.leadId, userId, `Contact removed: ${contact.name}.`);
		return { id };
	}

	async makePrimary(id: string, userId: string) {
		const contact = await this.db.leadContact.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				designation: true,
				phone: true,
				email: true,
				lead: {
					select: {
						id: true,
						name: true,
						designation: true,
						phone: true,
						email: true,
					},
				},
			},
		});
		if (!contact) throw new NotFoundException("That contact no longer exists.");
		const lead = contact.lead;
		await this.db.$transaction([
			this.db.lead.update({
				where: { id: lead.id },
				data: {
					name: contact.name,
					designation: contact.designation,
					phone: contact.phone,
					email: contact.email,
				},
			}),
			this.db.leadContact.update({
				where: { id: contact.id },
				data: {
					name: lead.name,
					designation: lead.designation,
					phone: lead.phone,
					email: lead.email,
				},
			}),
		]);
		await this.log(lead.id, userId, `Main contact changed to ${contact.name}.`);
		return { leadId: lead.id };
	}

	async sameCompany(leadId: string) {
		const lead = await this.db.lead.findUnique({
			where: { id: leadId },
			select: { id: true, companyName: true },
		});
		const name = lead?.companyName?.trim();
		if (!lead || !name) return [];
		return this.db.lead.findMany({
			where: {
				id: { not: lead.id },
				archivedAt: null,
				companyName: { equals: name, mode: "insensitive" },
			},
			orderBy: { createdAt: "asc" },
			take: LEADS.contacts.sameCompanyLimit,
			select: {
				id: true,
				name: true,
				companyName: true,
				stage: true,
				createdAt: true,
				owner: { select: { id: true, name: true } },
			},
		});
	}

	async merge(sourceId: string, targetId: string, userId: string) {
		if (sourceId === targetId) {
			throw new BadRequestException("A lead cannot be merged into itself.");
		}
		const [source, target] = await Promise.all([
			this.db.lead.findUnique({
				where: { id: sourceId },
				select: {
					id: true,
					name: true,
					designation: true,
					phone: true,
					email: true,
					archivedAt: true,
				},
			}),
			this.db.lead.findUnique({
				where: { id: targetId },
				select: { id: true, name: true, companyName: true, archivedAt: true },
			}),
		]);
		if (!source || source.archivedAt) {
			throw new NotFoundException("The lead to merge no longer exists.");
		}
		if (!target || target.archivedAt) {
			throw new NotFoundException("The lead to merge into no longer exists.");
		}

		const now = new Date();
		await this.db.$transaction(async (tx) => {
			await tx.leadContact.create({
				data: {
					leadId: target.id,
					name: source.name,
					designation: source.designation,
					phone: source.phone,
					email: source.email,
				},
			});
			await tx.leadContact.updateMany({
				where: { leadId: source.id },
				data: { leadId: target.id },
			});
			await tx.activity.updateMany({
				where: { leadId: source.id },
				data: { leadId: target.id },
			});
			await tx.formSubmission.updateMany({
				where: { leadId: source.id },
				data: { leadId: target.id },
			});
			await tx.leadConversationRead.deleteMany({
				where: { leadId: source.id },
			});
			await tx.lead.update({
				where: { id: source.id },
				data: { archivedAt: now },
			});
			await tx.activity.create({
				data: {
					type: ActivityType.STAGE_CHANGE,
					body: `Merged lead ${source.name} into this lead.`,
					leadId: target.id,
					createdById: userId,
					occurredAt: now,
				},
			});
			const latest = await tx.activity.findFirst({
				where: { leadId: target.id },
				orderBy: { occurredAt: { sort: "desc", nulls: "last" } },
				select: { occurredAt: true, createdAt: true },
			});
			await tx.lead.update({
				where: { id: target.id },
				data: {
					lastActivityAt: latest
						? (latest.occurredAt ?? latest.createdAt)
						: now,
				},
			});
		});
		return { leadId: target.id };
	}

	private async lead(id: string) {
		const lead = await this.db.lead.findUnique({
			where: { id },
			select: { id: true, entity: true, archivedAt: true },
		});
		if (!lead || lead.archivedAt) {
			throw new NotFoundException("That lead no longer exists.");
		}
		return lead;
	}

	private async log(leadId: string, userId: string, body: string) {
		const now = new Date();
		await this.db.$transaction([
			this.db.activity.create({
				data: {
					type: ActivityType.STAGE_CHANGE,
					body,
					leadId,
					createdById: userId,
					occurredAt: now,
				},
			}),
			this.db.lead.update({
				where: { id: leadId },
				data: { lastActivityAt: now },
			}),
		]);
	}
}

function blank(value: string | undefined | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function contactPhone(
	value: string | undefined | null,
	entity: NavirexEntity | null,
): string | null {
	const phone = blank(value);
	if (!phone) return null;
	return withCountryCode(
		phone,
		entity === "GERMANY" ? PHONE.germanyDial : PHONE.defaultDial,
	);
}
