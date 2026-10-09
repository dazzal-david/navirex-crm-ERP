import {
	templateFields,
	whatsappTemplateComponents,
} from "@crm/validation/whatsapp-template";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { CommunicationsService } from "../communications/communications.service";
import type { DashboardService } from "../dashboard/dashboard.service";
import type { LeadContactsService } from "../leads/lead-contacts.service";
import {
	LEAD_KINDS,
	LEAD_STAGES,
	NAVIREX_ENTITIES,
} from "../leads/leads.contracts";
import type { LeadsService } from "../leads/leads.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { TemplatesService } from "../templates/templates.service";
import { MCP_INSTRUCTIONS, MCP_SERVER } from "./mcp-config";

export type McpServices = {
	leads: LeadsService;
	contacts: LeadContactsService;
	communications: CommunicationsService;
	dashboard: DashboardService;
	templates: TemplatesService;
	notifications: NotificationsService;
};

type Json =
	| string
	| number
	| boolean
	| null
	| Date
	| Json[]
	| { [key: string]: Json | undefined };

const status = z.enum(LEAD_STAGES);

function ok(data: Json): CallToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
	};
}

function failed(error: Error | string): CallToolResult {
	return {
		isError: true,
		content: [
			{ type: "text", text: error instanceof Error ? error.message : error },
		],
	};
}

async function run(work: () => Promise<Json>): Promise<CallToolResult> {
	try {
		return ok(await work());
	} catch (error) {
		return failed(error instanceof Error ? error : String(error));
	}
}

export function buildMcpServer(
	userId: string,
	services: McpServices,
): McpServer {
	const {
		leads,
		contacts,
		communications,
		dashboard,
		templates,
		notifications,
	} = services;
	const server = new McpServer(
		{ name: MCP_SERVER.name, version: MCP_SERVER.version },
		{ instructions: MCP_INSTRUCTIONS },
	);

	server.registerTool(
		"search_leads",
		{
			title: "Search leads",
			description:
				"Find leads by company, person, phone or email, optionally filtered by status, owner, category or entity. Returns lead ids for the other tools.",
			inputSchema: {
				query: z.string().max(200).optional(),
				status: status.optional(),
				owner: z
					.enum(["anyone", "me", "unassigned"])
					.default("anyone")
					.describe("Whose leads to return."),
				kind: z.enum(LEAD_KINDS).optional(),
				entity: z.enum(NAVIREX_ENTITIES).optional(),
				limit: z
					.number()
					.int()
					.min(1)
					.max(MCP_SERVER.search.maxLimit)
					.default(MCP_SERVER.search.defaultLimit),
			},
			annotations: { readOnlyHint: true },
		},
		(input) =>
			run(async () => {
				const rows =
					input.owner === "unassigned"
						? (await leads.unassigned()).leads.filter(
								(lead) =>
									(!input.status || lead.stage === input.status) &&
									(!input.kind || lead.kind === input.kind) &&
									(!input.entity || lead.entity === input.entity) &&
									(!input.query ||
										[lead.name, lead.companyName, lead.email, lead.phone]
											.join(" ")
											.toLowerCase()
											.includes(input.query.toLowerCase())),
							)
						: (
								await leads.list(
									{
										q: input.query,
										stage: input.status,
										kind: input.kind,
										entity: input.entity,
										mine: input.owner === "me",
									},
									userId,
								)
							).leads;
				return rows.slice(0, input.limit).map((lead) => ({
					id: lead.id,
					company: lead.companyName,
					mainContact: lead.name,
					otherContacts: lead.contacts.map((person) => person.name),
					status: lead.stage,
					kind: lead.kind,
					entity: lead.entity,
					owner: lead.owner?.name ?? null,
					phone: lead.phone,
					email: lead.email,
					nextAction: lead.nextAction,
					source: lead.source,
					lastActivityAt: lead.lastActivityAt,
				}));
			}),
	);

	server.registerTool(
		"get_lead",
		{
			title: "Get lead details",
			description:
				"Everything about one lead: details, every person with phone and email, notes, recent email and WhatsApp messages, and whether each person's WhatsApp 24-hour window is open.",
			inputSchema: { lead_id: z.string() },
			annotations: { readOnlyHint: true },
		},
		({ lead_id }) =>
			run(async () => {
				const [lead, people, notes, conversation] = await Promise.all([
					leads.byId(lead_id),
					communications.recipients(lead_id),
					communications.notes(lead_id),
					communications.conversation(lead_id),
				]);
				const windows = await Promise.all(
					people.map((person) =>
						communications.whatsappWindow(lead_id, person.id ?? undefined),
					),
				);
				return {
					id: lead.id,
					company: lead.companyName,
					status: lead.stage,
					kind: lead.kind,
					entity: lead.entity,
					owner: lead.owner?.name ?? null,
					nextAction: lead.nextAction,
					source: lead.source,
					website: lead.website,
					country: lead.country,
					state: lead.state,
					address: lead.address,
					createdAt: lead.createdAt,
					lastActivityAt: lead.lastActivityAt,
					people: people.map((person, index) => ({
						contactId: person.id,
						main: person.primary,
						name: person.name,
						designation: person.designation,
						phone: person.phone,
						email: person.email,
						whatsappWindowOpen: windows[index]?.open ?? false,
						whatsappWindowClosesAt: windows[index]?.closesAt ?? null,
					})),
					notes: notes.slice(0, MCP_SERVER.lead.recentNotes).map((note) => ({
						by: note.authorName,
						at: note.occurredAt,
						text: note.body,
					})),
					recentMessages: conversation.items
						.filter((item) => item.channel !== "note")
						.slice(-MCP_SERVER.lead.recentMessages)
						.map((item) => ({
							channel: item.channel,
							direction: item.direction,
							from: item.authorName,
							to: item.recipientName,
							at: item.occurredAt,
							subject: item.subject,
							text: item.body,
							delivery: item.deliveryStatus,
						})),
				};
			}),
	);

	server.registerTool(
		"list_unread_whatsapp",
		{
			title: "Unread WhatsApp chats",
			description:
				"Leads with WhatsApp messages the signed-in user has not read yet, with the latest incoming message. Use get_lead for the full conversation before drafting a reply.",
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		() =>
			run(async () => {
				const waiting = (await communications.conversations(userId))
					.filter((row) => row.unread > 0)
					.slice(0, MCP_SERVER.unread.maxConversations);
				return Promise.all(
					waiting.map(async (row) => {
						const conversation = await communications.conversation(row.id);
						const lastInbound = conversation.items
							.filter(
								(item) =>
									item.channel === "whatsapp" && item.direction === "inbound",
							)
							.at(-1);
						return {
							leadId: row.id,
							lead: row.name,
							company: row.companyName,
							status: row.stage,
							unread: row.unread,
							lastMessage: lastInbound?.body ?? null,
							lastMessageFrom: lastInbound?.authorName ?? null,
							lastMessageAt: lastInbound?.occurredAt ?? null,
						};
					}),
				);
			}),
	);

	server.registerTool(
		"pipeline_summary",
		{
			title: "Pipeline summary",
			description:
				"Lead counts by status, new leads this week, leads needing attention (no activity for seven days) and unassigned leads.",
			inputSchema: {
				scope: z
					.enum(["me", "everyone"])
					.default("everyone")
					.describe("Only the signed-in user's leads, or the whole team."),
			},
			annotations: { readOnlyHint: true },
		},
		({ scope }) =>
			run(async () => {
				const overview = await dashboard.leadOverview(userId, { scope });
				return {
					totals: overview.totals,
					byStatus: overview.stages,
					needsAttention: overview.priorityLeads,
				};
			}),
	);

	server.registerTool(
		"list_team",
		{
			title: "List team members",
			description: "People who can own leads, with their ids for assign_lead.",
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		() =>
			run(async () =>
				(await leads.owners()).map((owner) => ({
					id: owner.id,
					name: owner.name,
					email: owner.email,
					designation: owner.designation,
				})),
			),
	);

	server.registerTool(
		"add_note",
		{
			title: "Add a note",
			description:
				'Add an internal note to a lead: call outcomes, meeting notes, research summaries, updates. To mention teammates ("mention Hari about this"), get their ids from list_team, pass them in mention_ids and write @Name in the text. Each mentioned person gets a CRM notification and an email.',
			inputSchema: {
				lead_id: z.string(),
				text: z.string().trim().min(1).max(20_000),
				mention_ids: z
					.array(z.string())
					.max(20)
					.default([])
					.describe("Team member ids from list_team."),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		({ lead_id, text, mention_ids }) =>
			run(async () => {
				const note = await communications.addNote(
					{ leadId: lead_id, body: text, mentions: mention_ids },
					userId,
				);
				const notified = await notifications.notifyMentions({
					actorId: userId,
					mentionIds: mention_ids,
					leadId: lead_id,
					activityId: note.id,
					text,
				});
				return { saved: true, noteId: note.id, notified };
			}),
	);

	server.registerTool(
		"email_team_member",
		{
			title: "Email a teammate",
			description:
				'Email a Navirex team member (id from list_team) from the shared mailbox, e.g. "email Parvathy about this update". Pass lead_id when it is about a lead: the email links to it and a note is logged on the lead. The teammate also sees it in their CRM notifications. Confirm the text with the user first.',
			inputSchema: {
				user_id: z.string(),
				subject: z.string().trim().min(1).max(300),
				body: z.string().trim().min(1).max(20_000),
				lead_id: z.string().optional(),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				openWorldHint: true,
			},
		},
		(input) =>
			run(async () =>
				notifications.messageMember({
					actorId: userId,
					userId: input.user_id,
					subject: input.subject,
					body: input.body,
					leadId: input.lead_id,
				}),
			),
	);

	server.registerTool(
		"update_lead",
		{
			title: "Update a lead",
			description:
				"Change a lead's status, next action, company name, category or entity. Only the fields given change.",
			inputSchema: {
				lead_id: z.string(),
				status: status.optional(),
				next_action: z.string().max(1000).optional(),
				company_name: z.string().max(200).optional(),
				kind: z.enum(LEAD_KINDS).optional(),
				entity: z.enum(NAVIREX_ENTITIES).optional(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		(input) =>
			run(async () => {
				const lead = await leads.update(
					{
						id: input.lead_id,
						stage: input.status,
						nextAction: input.next_action,
						companyName: input.company_name,
						kind: input.kind,
						entity: input.entity,
					},
					userId,
				);
				return {
					id: lead.id,
					status: lead.stage,
					nextAction: lead.nextAction,
					company: lead.companyName,
				};
			}),
	);

	server.registerTool(
		"assign_lead",
		{
			title: "Assign a lead",
			description:
				"Give a lead to a team member (id from list_team), or pass owner_id null to unassign.",
			inputSchema: {
				lead_id: z.string(),
				owner_id: z.string().nullable(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		({ lead_id, owner_id }) =>
			run(async () => {
				const lead = await leads.assign(lead_id, owner_id, userId);
				return { id: lead.id, owner: lead.owner?.name ?? null };
			}),
	);

	server.registerTool(
		"add_contact",
		{
			title: "Add a contact to a lead",
			description:
				"Add another person at the same company to a lead. Phone numbers without a country code get +91.",
			inputSchema: {
				lead_id: z.string(),
				name: z.string().trim().min(1).max(200),
				designation: z.string().max(200).optional(),
				phone: z.string().max(50).optional(),
				email: z.string().max(320).optional(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		(input) =>
			run(async () => {
				const contact = await contacts.add(
					{
						leadId: input.lead_id,
						name: input.name,
						designation: input.designation,
						phone: input.phone,
						email: input.email,
					},
					userId,
				);
				return {
					contactId: contact.id,
					name: contact.name,
					phone: contact.phone,
				};
			}),
	);

	server.registerTool(
		"list_whatsapp_templates",
		{
			title: "List WhatsApp templates",
			description:
				"Approved WhatsApp templates with their text and the fields each needs. Templates are the only way to message someone outside their 24-hour window.",
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		() =>
			run(async () =>
				(await templates.list())
					.filter(
						(template) =>
							template.active &&
							template.channel === "WHATSAPP" &&
							template.providerTemplateName,
					)
					.map((template) => {
						const parsed = whatsappTemplateComponents.safeParse(
							template.components,
						);
						return {
							name: template.providerTemplateName,
							label: template.name,
							language: template.language,
							text: template.body,
							fields: (parsed.success ? templateFields(parsed.data) : []).map(
								(field) => ({
									key: field.key,
									label: field.label,
									example: field.example,
								}),
							),
						};
					}),
			),
	);

	server.registerTool(
		"send_whatsapp",
		{
			title: "Send a WhatsApp message",
			description:
				"Send free text on WhatsApp to a lead's person. Only works inside that person's 24-hour window. Confirm the exact text and recipient with the user first.",
			inputSchema: {
				lead_id: z.string(),
				contact_id: z
					.string()
					.optional()
					.describe("Omit for the main contact."),
				text: z.string().trim().min(1).max(4096),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				openWorldHint: true,
			},
		},
		(input) =>
			run(async () => {
				const sent = await communications.sendWhatsApp(
					{
						leadId: input.lead_id,
						contactId: input.contact_id,
						mode: "text",
						body: input.text,
						language: "en_US",
						variables: [],
					},
					userId,
				);
				return { sent: true, messageId: sent.messageId };
			}),
	);

	server.registerTool(
		"send_whatsapp_template",
		{
			title: "Send a WhatsApp template",
			description:
				"Send an approved WhatsApp template (name from list_whatsapp_templates) with its fields filled in. Works outside the 24-hour window. Confirm with the user first.",
			inputSchema: {
				lead_id: z.string(),
				contact_id: z.string().optional(),
				template_name: z.string(),
				language: z.string().optional(),
				fields: z
					.record(z.string(), z.string().max(2000))
					.default({})
					.describe('Field key to value, e.g. {"body:1": "Arjun"}.'),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				openWorldHint: true,
			},
		},
		(input) =>
			run(async () => {
				const template = (await templates.list()).find(
					(row) =>
						row.active &&
						row.channel === "WHATSAPP" &&
						row.providerTemplateName === input.template_name,
				);
				if (!template) {
					throw new Error(
						`No approved WhatsApp template named ${input.template_name}.`,
					);
				}
				const sent = await communications.sendWhatsApp(
					{
						leadId: input.lead_id,
						contactId: input.contact_id,
						mode: "template",
						templateName: input.template_name,
						language: input.language ?? template.language,
						variables: [],
						fields: input.fields,
					},
					userId,
				);
				return { sent: true, messageId: sent.messageId };
			}),
	);

	server.registerTool(
		"send_email",
		{
			title: "Send an email",
			description:
				"Email a lead's person from the shared Navirex mailbox. Confirm subject, body and recipient with the user first.",
			inputSchema: {
				lead_id: z.string(),
				contact_id: z.string().optional(),
				subject: z.string().trim().min(1).max(300),
				body: z.string().trim().min(1).max(50_000),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				openWorldHint: true,
			},
		},
		(input) =>
			run(async () => {
				const sent = await communications.sendEmail(
					{
						leadId: input.lead_id,
						contactId: input.contact_id,
						subject: input.subject,
						body: input.body,
						attachments: [],
					},
					userId,
				);
				return { sent: true, messageId: sent.messageId };
			}),
	);

	return server;
}
