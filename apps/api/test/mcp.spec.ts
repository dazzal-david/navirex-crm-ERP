import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CommunicationsService } from "../src/communications/communications.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";
import { LeadContactsService } from "../src/leads/lead-contacts.service";
import { LeadsService } from "../src/leads/leads.service";
import { buildMcpServer } from "../src/mcp/mcp-tools";
import { NotificationsService } from "../src/notifications/notifications.service";
import { TemplatesService } from "../src/templates/templates.service";

const suffix = crypto.randomUUID();
const userId = `mcp-user-${suffix}`;

const sentMail: { to: string; subject: string; body: string }[] = [];
const mailbox = {
	configured: true,
	send: async (to: string, subject: string, body: string) => {
		sentMail.push({ to, subject, body });
	},
};

const leads = new LeadsService(db, new AgentTriggerService(db));
const communications = new CommunicationsService(
	db,
	{} as never,
	{} as never,
	{ get: () => undefined } as never,
);
const services = {
	leads,
	contacts: new LeadContactsService(db),
	communications,
	dashboard: new DashboardService(db, new ConversionService(db)),
	templates: new TemplatesService(db, { get: () => undefined } as never),
	notifications: new NotificationsService(db, mailbox as never),
};

let client: Client;

const textSchema = { content: [{ type: "text", text: "" }] };

async function call(
	name: string,
	args: Record<string, string | number | null | string[]>,
) {
	const result = await client.callTool({ name, arguments: args });
	const content = (result.content ?? textSchema.content) as { text: string }[];
	return {
		isError: result.isError === true,
		text: content[0]?.text ?? "",
	};
}

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Connector Rep",
			email: `${userId}@example.test`,
			createdAt: new Date(Date.now() - 60 * 60_000),
		},
	});
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await buildMcpServer(userId, services).connect(serverSide);
	client = new Client({ name: "test", version: "1.0.0" });
	await client.connect(clientSide);
});

afterAll(async () => {
	await client.close();
	await db.agentTask.deleteMany({
		where: { kind: "agent-event", reason: "lead.created" },
	});
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.lead.deleteMany({ where: { name: { endsWith: suffix } } });
	await db.user.delete({ where: { id: userId } });
});

describe("the Claude connector", () => {
	it("offers the lead tools and marks the sending tools as destructive", async () => {
		const { tools } = await client.listTools();
		const byName = new Map(tools.map((tool) => [tool.name, tool]));

		expect([...byName.keys()].sort()).toEqual([
			"add_contact",
			"add_note",
			"assign_lead",
			"email_team_member",
			"get_lead",
			"list_team",
			"list_unread_whatsapp",
			"list_whatsapp_templates",
			"pipeline_summary",
			"search_leads",
			"send_email",
			"send_whatsapp",
			"send_whatsapp_template",
			"update_lead",
		]);
		expect(byName.get("send_whatsapp")?.annotations?.destructiveHint).toBe(
			true,
		);
		expect(byName.get("search_leads")?.annotations?.readOnlyHint).toBe(true);
	});

	it("finds a lead, notes research on it and moves its status as the signed-in user", async () => {
		const lead = await leads.create(
			{
				name: `Athul ${suffix}`,
				companyName: `Connector Solar ${suffix}`,
				kind: "EPC",
				stage: "CONTACTED",
			},
			userId,
		);

		const found = await call("search_leads", {
			query: `Connector Solar ${suffix}`,
		});
		const note = await call("add_note", {
			lead_id: lead.id,
			text: "Research: 40 MW installed in Kerala.",
		});
		const moved = await call("update_lead", {
			lead_id: lead.id,
			status: "FOLLOW_UP",
			next_action: "Send the brochure",
		});

		expect(JSON.parse(found.text)[0].id).toBe(lead.id);
		expect(note.isError).toBe(false);
		expect(JSON.parse(moved.text)).toMatchObject({
			status: "FOLLOW_UP",
			nextAction: "Send the brochure",
		});
		const notes = await communications.notes(lead.id);
		expect(notes[0]).toMatchObject({
			body: "Research: 40 MW installed in Kerala.",
			authorName: "Connector Rep",
		});
	});

	it("lists an unread WhatsApp chat with its last message", async () => {
		const lead = await leads.create(
			{
				name: `Silpa ${suffix}`,
				companyName: `Unread Solar ${suffix}`,
				kind: "EPC",
				stage: "CONTACTED",
				phone: "+919888800011",
			},
			userId,
		);
		await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "WhatsApp message",
				body: "Please share the price list",
				leadId: lead.id,
				createdById: userId,
				occurredAt: new Date(),
				meta: {
					channel: "whatsapp",
					direction: "inbound",
					from: "919888800011",
					fromName: "Silpa",
				},
			},
		});

		const unread = JSON.parse((await call("list_unread_whatsapp", {})).text);

		expect(
			unread.find((row: { leadId: string }) => row.leadId === lead.id),
		).toMatchObject({
			lastMessage: "Please share the price list",
			lastMessageFrom: "Silpa",
		});
	});

	it("reports a clear error instead of failing the call", async () => {
		const result = await call("get_lead", { lead_id: "missing" });

		expect(result).toEqual({
			isError: true,
			text: "That lead no longer exists.",
		});
	});

	it("mentions a teammate from a note and emails them", async () => {
		const teammate = `mcp-hari-${suffix}`;
		await db.user.create({
			data: { id: teammate, name: "Hari", email: `${teammate}@example.test` },
		});
		await db.organization.upsert({
			where: { id: "workspace" },
			create: {
				id: "workspace",
				name: "Navirex",
				slug: "navirex",
				createdAt: new Date(),
			},
			update: {},
		});
		await db.member.create({
			data: {
				id: `member-${teammate}`,
				organizationId: "workspace",
				userId: teammate,
				role: "member",
				createdAt: new Date(),
			},
		});
		const lead = await leads.create(
			{
				name: `Mention ${suffix}`,
				companyName: `Mention Solar ${suffix}`,
				kind: "EPC",
				stage: "CONTACTED",
			},
			userId,
		);

		const result = JSON.parse(
			(
				await call("add_note", {
					lead_id: lead.id,
					text: "@Hari please call them Monday",
					mention_ids: [teammate],
				})
			).text,
		);

		const bell = await db.notification.findMany({
			where: { userId: teammate },
			select: { kind: true, title: true, leadId: true },
		});
		expect(result.notified).toBe(1);
		expect(bell).toEqual([
			{
				kind: "MENTION",
				title: `Connector Rep mentioned you on Mention Solar ${suffix}`,
				leadId: lead.id,
			},
		]);
		expect(sentMail.at(-1)?.to).toBe(`${teammate}@example.test`);
		expect(sentMail.at(-1)?.body).toContain("@Hari please call them Monday");

		const emailed = JSON.parse(
			(
				await call("email_team_member", {
					user_id: teammate,
					subject: "Mention Solar update",
					body: "They signed today.",
					lead_id: lead.id,
				})
			).text,
		);
		expect(emailed).toEqual({ sent: true, to: "Hari" });
		expect(sentMail.at(-1)?.subject).toBe("Mention Solar update");

		await db.notification.deleteMany({ where: { userId: teammate } });
		await db.member.delete({ where: { id: `member-${teammate}` } });
		await db.activity.deleteMany({ where: { leadId: lead.id } });
		await db.user.delete({ where: { id: teammate } });
	});
});
