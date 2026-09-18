import { createHmac, timingSafeEqual } from "node:crypto";
import { auth, isMetaConfigured, META_PROVIDER_ID } from "@crm/auth";
import type { Db } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { LeadsService } from "../leads/leads.service";
import type { MetaPage } from "./meta.contracts";
import { META } from "./meta-config";

type GraphPage = { id: string; name: string; access_token?: string };
type GraphField = { name: string; values?: string[] };
type GraphLead = {
	id: string;
	created_time?: string;
	ad_id?: string;
	form_id?: string;
	field_data?: GraphField[];
};
type GraphList<T> = { data?: T[]; paging?: { next?: string } };

@Injectable()
export class MetaService {
	private readonly logger = new Logger(MetaService.name);
	private readonly verifyToken?: string;
	private readonly appSecret?: string;

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly leads: LeadsService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.verifyToken = config.get("META_WEBHOOK_VERIFY_TOKEN", { infer: true });
		this.appSecret = config.get("META_CLIENT_SECRET", { infer: true });
	}

	async status(userId: string) {
		const [account, pages] = await Promise.all([
			this.db.account.findFirst({
				where: {
					userId,
					providerId: META_PROVIDER_ID,
					accessToken: { not: null },
				},
				select: { id: true },
			}),
			this.connectedPages(),
		]);

		return {
			configured: isMetaConfigured(),
			linked: Boolean(account),
			webhookConfigured: Boolean(this.verifyToken),
			webhookUrl: new URL(
				META.webhookPath,
				process.env.API_URL ?? "http://localhost:3001",
			).toString(),
			pages,
		};
	}

	async availablePages(userId: string): Promise<MetaPage[]> {
		const token = await this.userToken(userId);
		const available = await this.get<GraphList<GraphPage>>(
			`${META.graphBase}/me/accounts?fields=id,name,access_token&limit=100`,
			token,
		);
		const connected = new Map(
			(await this.connectedPages()).map((page) => [page.id, page] as const),
		);

		return (available.data ?? []).map((page) => {
			const saved = connected.get(page.id);
			return {
				id: page.id,
				name: page.name,
				connected: Boolean(saved),
				subscribedAt: saved?.subscribedAt ?? null,
				lastSyncedAt: saved?.lastSyncedAt ?? null,
				lastError: saved?.lastError ?? null,
			};
		});
	}

	async connectPage(userId: string, pageId: string) {
		const token = await this.userToken(userId);
		const pages = await this.get<GraphList<GraphPage>>(
			`${META.graphBase}/me/accounts?fields=id,name,access_token&limit=100`,
			token,
		);
		const page = (pages.data ?? []).find((entry) => entry.id === pageId);
		if (!page?.access_token) {
			throw new NotFoundException("That Meta page is unavailable.");
		}

		await this.post(
			`${META.graphBase}/${encodeURIComponent(page.id)}/subscribed_apps`,
			page.access_token,
			{ subscribed_fields: "leadgen" },
		);

		await this.db.metaPageConnection.upsert({
			where: { pageId: page.id },
			create: {
				pageId: page.id,
				pageName: page.name,
				accessToken: page.access_token,
				connectedById: userId,
				subscribedAt: new Date(),
			},
			update: {
				pageName: page.name,
				accessToken: page.access_token,
				connectedById: userId,
				subscribedAt: new Date(),
				lastError: null,
			},
		});

		return { success: true };
	}

	async disconnectPage(pageId: string) {
		const page = await this.db.metaPageConnection.findUnique({
			where: { pageId },
		});
		if (!page) return { success: true };

		try {
			await this.delete(
				`${META.graphBase}/${encodeURIComponent(pageId)}/subscribed_apps`,
				page.accessToken,
			);
		} finally {
			await this.db.metaPageConnection.delete({ where: { pageId } });
		}

		return { success: true };
	}

	async sync(userId: string) {
		const pages = await this.db.metaPageConnection.findMany();
		let created = 0;
		let matched = 0;
		let failed = 0;

		for (const page of pages) {
			try {
				const forms = await this.all<{ id: string }>(
					`${META.graphBase}/${encodeURIComponent(page.pageId)}/leadgen_forms?fields=id&limit=100`,
					page.accessToken,
				);
				for (const form of forms) {
					const leads = await this.all<GraphLead>(
						`${META.graphBase}/${encodeURIComponent(form.id)}/leads?fields=id,created_time,ad_id,form_id,field_data&limit=100`,
						page.accessToken,
					);
					for (const lead of leads) {
						const outcome = await this.fileLead(lead, page.pageName, userId);
						if (outcome.created) created += 1;
						else matched += 1;
					}
				}
				await this.db.metaPageConnection.update({
					where: { pageId: page.pageId },
					data: { lastSyncedAt: new Date(), lastError: null },
				});
			} catch (error) {
				failed += 1;
				await this.db.metaPageConnection.update({
					where: { pageId: page.pageId },
					data: { lastError: messageOf(error) },
				});
			}
		}

		return { pages: pages.length, created, matched, failed };
	}

	verify(challenge: string | undefined, token: string | undefined): string {
		if (!this.verifyToken || token !== this.verifyToken || !challenge) {
			throw new BadRequestException("Meta webhook verification failed.");
		}
		return challenge;
	}

	verifySignature(raw: string, signature: string | undefined): void {
		if (!this.appSecret || !signature?.startsWith("sha256=")) {
			throw new BadRequestException("Meta webhook signature is missing.");
		}
		const expected = createHmac("sha256", this.appSecret)
			.update(raw)
			.digest("hex");
		const received = signature.slice("sha256=".length);
		const left = Buffer.from(expected, "hex");
		const right = Buffer.from(received, "hex");
		if (left.length !== right.length || !timingSafeEqual(left, right)) {
			throw new BadRequestException("Meta webhook signature is invalid.");
		}
	}

	async webhook(payload: unknown): Promise<void> {
		const body = payload as {
			entry?: {
				id?: string;
				changes?: {
					field?: string;
					value?: { leadgen_id?: string; page_id?: string };
				}[];
			}[];
		};
		for (const entry of body.entry ?? []) {
			for (const change of entry.changes ?? []) {
				const leadId = change.value?.leadgen_id;
				const pageId = change.value?.page_id ?? entry.id;
				if (change.field !== "leadgen" || !leadId || !pageId) continue;
				const page = await this.db.metaPageConnection.findUnique({
					where: { pageId },
				});
				if (!page) continue;
				try {
					const lead = await this.get<GraphLead>(
						`${META.graphBase}/${encodeURIComponent(leadId)}?fields=id,created_time,ad_id,form_id,field_data`,
						page.accessToken,
					);
					await this.fileLead(lead, page.pageName, page.connectedById);
					await this.db.metaPageConnection.update({
						where: { pageId },
						data: { lastSyncedAt: new Date(), lastError: null },
					});
				} catch (error) {
					this.logger.error({
						message: "Meta lead could not be filed",
						pageId,
						leadId,
						reason: messageOf(error),
					});
					await this.db.metaPageConnection.update({
						where: { pageId },
						data: { lastError: messageOf(error) },
					});
				}
			}
		}
	}

	private async connectedPages(): Promise<MetaPage[]> {
		const pages = await this.db.metaPageConnection.findMany({
			orderBy: { pageName: "asc" },
		});
		return pages.map((page) => ({
			id: page.pageId,
			name: page.pageName,
			connected: true,
			subscribedAt: page.subscribedAt?.toISOString() ?? null,
			lastSyncedAt: page.lastSyncedAt?.toISOString() ?? null,
			lastError: page.lastError,
		}));
	}

	private async userToken(userId: string): Promise<string> {
		if (!isMetaConfigured())
			throw new BadRequestException("Meta is not configured.");
		try {
			const token = await auth.api.getAccessToken({
				body: { providerId: META_PROVIDER_ID, userId },
			});
			if (token.accessToken) return token.accessToken;
		} catch {}
		throw new BadRequestException("Reconnect Meta Business to continue.");
	}

	private async fileLead(lead: GraphLead, pageName: string, userId: string) {
		const fields = new Map(
			(lead.field_data ?? []).map(
				(field) => [field.name.toLowerCase(), field.values?.[0] ?? ""] as const,
			),
		);
		const first = pick(fields, "first_name", "first name");
		const last = pick(fields, "last_name", "last name");
		const email = pick(fields, "email");
		const phone = pick(fields, "phone_number", "phone", "mobile_number");
		const name =
			pick(fields, "full_name", "full name") ||
			[first, last].filter(Boolean).join(" ") ||
			email ||
			phone ||
			"Meta lead";
		return this.leads.intake(
			{
				name,
				companyName: pick(fields, "company_name", "company") || undefined,
				email: email || undefined,
				phone: phone || undefined,
				kind: "OTHER",
				stage: "UNASSIGNED",
				source: `Meta Lead Ads · ${pageName}`,
				externalId: lead.id,
				country: pick(fields, "country") || undefined,
				notes:
					[
						lead.form_id ? `Form ${lead.form_id}` : null,
						lead.ad_id ? `Ad ${lead.ad_id}` : null,
					]
						.filter(Boolean)
						.join(" · ") || undefined,
			},
			userId,
		);
	}

	private async all<T>(url: string, token: string): Promise<T[]> {
		const rows: T[] = [];
		let next: string | undefined = url;
		while (next) {
			const response: GraphList<T> = await this.get<GraphList<T>>(next, token);
			rows.push(...(response.data ?? []));
			next = response.paging?.next;
		}
		return rows;
	}

	private async get<T>(url: string, token: string): Promise<T> {
		return this.request<T>(url, token, { method: "GET" });
	}

	private async post<T>(
		url: string,
		token: string,
		body: Record<string, string>,
	): Promise<T> {
		return this.request<T>(url, token, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams(body),
		});
	}

	private async delete<T>(url: string, token: string): Promise<T> {
		return this.request<T>(url, token, { method: "DELETE" });
	}

	private async request<T>(
		url: string,
		token: string,
		init: RequestInit,
	): Promise<T> {
		const target = new URL(url);
		if (target.hostname !== "graph.facebook.com")
			throw new BadRequestException("Meta returned an invalid paging URL.");
		const response = await fetch(target, {
			...init,
			headers: { ...init.headers, authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(20_000),
		});
		const body = (await response.json()) as T & {
			error?: { message?: string };
		};
		if (!response.ok)
			throw new BadRequestException(
				body.error?.message ?? `Meta returned HTTP ${response.status}.`,
			);
		return body;
	}
}

function pick(fields: Map<string, string>, ...names: string[]): string {
	for (const name of names) {
		const value = fields.get(name);
		if (value?.trim()) return value.trim();
	}
	return "";
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
