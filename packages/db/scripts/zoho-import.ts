import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/client";

type CsvRow = Record<string, string>;
type ImportKind =
	| "accounts"
	| "contacts"
	| "deals"
	| "leads"
	| "notes"
	| "calls"
	| "tasks";

type Totals = Record<ImportKind, { created: number; updated: number }>;

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const directory = resolve(argument("--dir") ?? process.cwd());
const fallbackEmail = argument("--fallback-user")?.toLowerCase();
const files = {
	accounts: csvFile("Accounts"),
	contacts: csvFile("Contacts"),
	deals: csvFile("Deals"),
	leads: csvFile("Leads"),
	notes: csvFile("Notes_Leads"),
	calls: csvFile("Calls"),
	tasks: csvFile("Tasks"),
	users: csvFile("Users"),
};

const tables = Object.fromEntries(
	Object.entries(files).map(([name, file]) => [name, readCsv(file)]),
) as Record<keyof typeof files, CsvRow[]>;

const required: Record<keyof typeof files, string[]> = {
	accounts: ["Record Id", "Account Name"],
	contacts: ["Record Id", "Contact Name"],
	deals: ["Record Id", "Deal Name", "Account Name.id"],
	leads: ["Record Id", "Lead Name"],
	notes: ["Record Id", "Associated_Id", "Note Content"],
	calls: ["Record Id", "Subject"],
	tasks: ["Record Id", "Subject"],
	users: ["Record Id", "Email"],
};

for (const [name, columns] of Object.entries(required)) {
	const rows = tables[name as keyof typeof tables];
	for (const column of columns) {
		if (rows.length > 0 && !(column in (rows[0] ?? {}))) {
			throw new Error(`${name} is missing the ${column} column.`);
		}
	}
}

const crmUsers = await db.user.findMany({
	select: { id: true, email: true },
});
const crmUserByEmail = new Map(
	crmUsers.map((user) => [user.email.toLowerCase(), user.id]),
);
const zohoUserEmail = new Map(
	tables.users.map((row) => [
		cell(row, "Record Id"),
		cell(row, "Email").toLowerCase(),
	]),
);
const userIdByZohoId = new Map(
	[...zohoUserEmail].flatMap(([zohoId, email]) => {
		const userId = crmUserByEmail.get(email);
		return userId ? [[zohoId, userId] as const] : [];
	}),
);
const fallbackUserId = await resolveFallbackUser();

const counts = {
	accounts: tables.accounts.length,
	contacts: tables.contacts.length,
	deals: tables.deals.length,
	leads: tables.leads.length,
	notes: tables.notes.length,
	calls: tables.calls.length,
	tasks: tables.tasks.length,
};

console.log(
	JSON.stringify({ mode: commit ? "commit" : "dry-run", counts }, null, 2),
);
console.log(
	`${userIdByZohoId.size} of ${zohoUserEmail.size} Zoho users match CRM accounts.`,
);

if (!commit) {
	console.log("No records changed. Add --commit after reviewing this summary.");
	await db.$disconnect();
	process.exit(0);
}

const totals: Totals = {
	accounts: { created: 0, updated: 0 },
	contacts: { created: 0, updated: 0 },
	deals: { created: 0, updated: 0 },
	leads: { created: 0, updated: 0 },
	notes: { created: 0, updated: 0 },
	calls: { created: 0, updated: 0 },
	tasks: { created: 0, updated: 0 },
};
const companyByZohoId = new Map<string, string>();
const contactByZohoId = new Map<string, string>();
const dealByZohoId = new Map<string, string>();
const leadByZohoId = new Map<string, string>();

for (const row of tables.accounts) {
	const zohoId = cell(row, "Record Id");
	const name = cell(row, "Account Name").trim();
	if (!zohoId || !name) continue;
	const website = optional(row.Website);
	const domain = website ? domainOf(website) : null;
	const existing = await db.company.findFirst({
		where: {
			archivedAt: null,
			OR: [
				...(domain ? [{ domain }] : []),
				{ name: { equals: name, mode: "insensitive" } },
			],
		},
		select: { id: true },
	});
	const data = {
		name,
		domain,
		website,
		description: optional(row.Description),
		industry: optional(row.Industry),
		city: optional(row["Billing Address - City"]),
		stateCode: optional(row["Billing Address - State / Province"]),
		country: optional(row["Billing Address - Country / Region"]),
		phone: optional(row.Phone),
		ownerId: ownerId(row["Account Owner.id"]),
		source: "IMPORT" as const,
	};
	const company = existing
		? await db.company.update({ where: { id: existing.id }, data })
		: await db.company.create({ data });
	companyByZohoId.set(zohoId, company.id);
	increment("accounts", Boolean(existing));
}

for (const row of tables.contacts) {
	const zohoId = cell(row, "Record Id");
	if (!zohoId) continue;
	const companyId = companyByZohoId.get(cell(row, "Account Name.id"));
	const email = optional(row.Email)?.toLowerCase() ?? null;
	const firstName =
		optional(row["First Name"]) ??
		optional(row["Contact Name"]) ??
		email ??
		"Unknown contact";
	const lastName = optional(row["Last Name"]);
	const existing = await db.contact.findFirst({
		where: {
			archivedAt: null,
			OR: [
				...(email
					? [{ email: { equals: email, mode: "insensitive" as const } }]
					: []),
				{ firstName, lastName, companyId },
			],
		},
		select: { id: true },
	});
	const data = {
		firstName,
		lastName,
		email,
		phone: optional(row.Phone) ?? optional(row.Mobile),
		title: optional(row.Title),
		companyId: companyId ?? null,
		ownerId: ownerId(row["Contact Owner.id"]),
		source: "IMPORT" as const,
	};
	const contact = existing
		? await db.contact.update({ where: { id: existing.id }, data })
		: await db.contact.create({ data });
	contactByZohoId.set(zohoId, contact.id);
	increment("contacts", Boolean(existing));
}

for (const row of tables.deals) {
	const zohoId = cell(row, "Record Id");
	const companyId = companyByZohoId.get(cell(row, "Account Name.id"));
	const name = cell(row, "Deal Name").trim();
	if (!zohoId || !companyId || !name) continue;
	const existing = await db.deal.findFirst({
		where: { name: { equals: name, mode: "insensitive" }, companyId },
		select: { id: true },
	});
	const owner = ownerId(row["Deal Owner.id"]) ?? fallbackUserId;
	const data = {
		name,
		description: optional(row.Description),
		companyId,
		ownerId: owner,
		stage: dealStage(cell(row, "Stage")),
		amount: decimal(row.Amount),
		currency: optional(row.Currency) ?? "INR",
		expectedCloseDate: dateOf(row["Closing Date"]),
		closedAt: /closed/i.test(cell(row, "Stage"))
			? dateOf(row["Modified Time"])
			: null,
		closedReason: optional(row["Reason For Loss"]),
	};
	const deal = existing
		? await db.deal.update({ where: { id: existing.id }, data })
		: await db.deal.create({ data });
	dealByZohoId.set(zohoId, deal.id);
	const contactId = contactByZohoId.get(cell(row, "Contact Name.id"));
	if (contactId) {
		await db.dealContact.upsert({
			where: { dealId_contactId: { dealId: deal.id, contactId } },
			update: {},
			create: { dealId: deal.id, contactId },
		});
	}
	increment("deals", Boolean(existing));
}

for (const [index, row] of tables.leads.entries()) {
	const zohoId = cell(row, "Record Id");
	const name =
		optional(row["Lead Name"]) ??
		[optional(row["First Name"]), optional(row["Last Name"])]
			.filter(Boolean)
			.join(" ");
	if (!zohoId || !name) continue;
	const email = optional(row.Email)?.toLowerCase() ?? null;
	const existing = await db.lead.findFirst({
		where: {
			OR: [
				{ zohoId },
				...(email
					? [{ email: { equals: email, mode: "insensitive" as const } }]
					: []),
			],
		},
		select: { id: true },
	});
	const data = {
		name,
		companyName: optional(row.Company),
		email,
		phone: optional(row.Phone) ?? optional(row.Mobile),
		stage: leadStage(cell(row, "Lead Status"), cell(row, "Is Converted")),
		position: index,
		ownerId: ownerId(row["Lead Owner.id"]),
		source: optional(row["Lead Source"]) ?? "Zoho CRM",
		country: optional(row["Address - Country / Region"]),
		notes: optional(row.Description),
		zohoId,
		companyId: companyByZohoId.get(cell(row, "Converted Account.id")) ?? null,
		contactId: contactByZohoId.get(cell(row, "Converted Contact.id")) ?? null,
	};
	const lead = existing
		? await db.lead.update({ where: { id: existing.id }, data })
		: await db.lead.create({ data });
	leadByZohoId.set(zohoId, lead.id);
	increment("leads", Boolean(existing));
}

for (const row of tables.notes) {
	const relation = relationFor(cell(row, "Associated_Id"));
	if (!relation) continue;
	await storeActivity("notes", cell(row, "Record Id"), {
		type: "NOTE",
		subject: optional(row["Note Title"]) ?? "Zoho note",
		body: optional(row["Note Content"]),
		occurredAt: dateOf(row["Created Time"]),
		createdById: ownerId(row["Note Owner.id"]) ?? fallbackUserId,
		...relation,
	});
}

for (const row of tables.calls) {
	const relation = relationFor(
		cell(row, "Related To.id"),
		cell(row, "Contact Name.id"),
	);
	if (!relation) continue;
	await storeActivity("calls", cell(row, "Record Id"), {
		type: "CALL",
		subject: optional(row.Subject) ?? "Zoho call",
		body: optional(row.Description) ?? optional(row["Call Agenda"]),
		occurredAt: dateOf(row["Call Start Time"]),
		completedAt: /completed/i.test(cell(row, "Call Status"))
			? dateOf(row["Modified Time"])
			: null,
		createdById: ownerId(row["Call Owner.id"]) ?? fallbackUserId,
		...relation,
	});
}

for (const row of tables.tasks) {
	const relation = relationFor(
		cell(row, "Related To.id"),
		cell(row, "Contact Name.id"),
	);
	if (!relation) continue;
	await storeActivity("tasks", cell(row, "Record Id"), {
		type: "TASK",
		subject: optional(row.Subject) ?? "Zoho task",
		body: optional(row.Description),
		occurredAt: dateOf(row["Created Time"]),
		dueAt: dateOf(row["Due Date"]),
		completedAt: /completed/i.test(cell(row, "Status"))
			? (dateOf(row["Closed Time"]) ?? dateOf(row["Modified Time"]))
			: null,
		createdById: ownerId(row["Task Owner.id"]) ?? fallbackUserId,
		...relation,
	});
}

console.log(JSON.stringify({ mode: "committed", totals }, null, 2));
await db.$disconnect();

function argument(name: string): string | undefined {
	const direct = args.find((value) => value.startsWith(`${name}=`));
	if (direct) return direct.slice(name.length + 1);
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

function csvFile(prefix: string): string {
	const exact = resolve(directory, `${prefix}.csv`);
	if (existsSync(exact)) return exact;
	const match = readdirSync(directory).find(
		(name) => name.startsWith(`${prefix}_`) && name.endsWith(".csv"),
	);
	if (!match) throw new Error(`No ${prefix} CSV was found in ${directory}.`);
	return resolve(directory, match);
}

function readCsv(file: string): CsvRow[] {
	const rows = parseCsv(readFileSync(file, "utf8"));
	const headers = rows[0] ?? [];
	return rows
		.slice(1)
		.map((cells) =>
			Object.fromEntries(
				headers.map((header, index) => [header, cells[index] ?? ""]),
			),
		);
}

function parseCsv(input: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < input.length; index += 1) {
		const character = input[index];
		if (character === '"' && quoted && input[index + 1] === '"') {
			field += '"';
			index += 1;
		} else if (character === '"') quoted = !quoted;
		else if (character === "," && !quoted) {
			row.push(field);
			field = "";
		} else if ((character === "\n" || character === "\r") && !quoted) {
			if (character === "\r" && input[index + 1] === "\n") index += 1;
			row.push(field);
			if (row.some((cell) => cell.trim())) rows.push(row);
			row = [];
			field = "";
		} else field += character;
	}
	row.push(field);
	if (row.some((cell) => cell.trim())) rows.push(row);
	return rows;
}

function optional(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function cell(row: CsvRow, column: string): string {
	return row[column] ?? "";
}

function domainOf(value: string): string | null {
	try {
		return new URL(value.includes("://") ? value : `https://${value}`).hostname
			.toLowerCase()
			.replace(/^www\./, "");
	} catch {
		return null;
	}
}

function dateOf(value: string | undefined): Date | null {
	const clean = optional(value);
	if (!clean) return null;
	const iso = clean.includes(" ")
		? clean.replace(" ", "T")
		: `${clean}T12:00:00`;
	const date = new Date(`${iso}+05:30`);
	return Number.isNaN(date.valueOf()) ? null : date;
}

function decimal(value: string | undefined): string | null {
	const clean = optional(value)?.replaceAll(",", "");
	return clean && /^-?\d+(\.\d+)?$/.test(clean) ? clean : null;
}

function ownerId(zohoId: string | undefined): string | null {
	return zohoId ? (userIdByZohoId.get(zohoId) ?? null) : null;
}

function dealStage(value: string) {
	const normalized = value.toLowerCase();
	if (normalized.includes("won")) return "CLOSED_WON" as const;
	if (normalized.includes("lost")) return "CLOSED_LOST" as const;
	if (normalized.includes("contract")) return "CONTRACT_SENT" as const;
	if (normalized.includes("decision"))
		return "DECISION_MAKER_BOUGHT_IN" as const;
	if (normalized.includes("unqual")) return "UNQUALIFIED_TO_BUY" as const;
	if (normalized.includes("qualif")) return "QUALIFIED_TO_BUY" as const;
	return "DEMO_BOOKED" as const;
}

function leadStage(value: string, converted: string) {
	if (/true|yes/i.test(converted)) return "APPROVED" as const;
	const normalized = value.toLowerCase();
	if (/not qualified|junk|lost|reject/.test(normalized))
		return "REJECTED" as const;
	if (/pre-qualified|interest|hot/.test(normalized))
		return "INTERESTED" as const;
	if (/contacted|attempted|future|follow/.test(normalized))
		return "TALKING" as const;
	if (/qualified|approve|convert|won/.test(normalized))
		return "APPROVED" as const;
	return "UNASSIGNED" as const;
}

function relationFor(relatedId: string, contactId?: string) {
	const leadId = leadByZohoId.get(relatedId);
	if (leadId) return { leadId };
	const dealId = dealByZohoId.get(relatedId);
	if (dealId) return { dealId };
	const companyId = companyByZohoId.get(relatedId);
	if (companyId) return { companyId };
	const resolvedContactId =
		contactByZohoId.get(contactId ?? "") ?? contactByZohoId.get(relatedId);
	return resolvedContactId ? { contactId: resolvedContactId } : null;
}

async function storeActivity(
	kind: "notes" | "calls" | "tasks",
	zohoId: string,
	data: Parameters<typeof db.activity.create>[0]["data"],
) {
	if (!zohoId) return;
	const existing = await db.activity.findFirst({
		where: { meta: { path: ["zohoId"], equals: zohoId } },
		select: { id: true },
	});
	const payload = {
		...data,
		meta: { source: "Zoho CRM", zohoId },
	};
	if (existing)
		await db.activity.update({ where: { id: existing.id }, data: payload });
	else await db.activity.create({ data: payload });
	increment(kind, Boolean(existing));
}

function increment(kind: ImportKind, updated: boolean) {
	totals[kind][updated ? "updated" : "created"] += 1;
}

async function resolveFallbackUser(): Promise<string> {
	if (fallbackEmail) {
		const userId = crmUserByEmail.get(fallbackEmail);
		if (!userId) throw new Error("The fallback CRM user does not exist.");
		return userId;
	}
	const member = await db.member.findFirst({
		where: { role: "owner" },
		orderBy: { createdAt: "asc" },
		select: { userId: true },
	});
	if (!member) throw new Error("No CRM owner exists for imported activities.");
	return member.userId;
}
