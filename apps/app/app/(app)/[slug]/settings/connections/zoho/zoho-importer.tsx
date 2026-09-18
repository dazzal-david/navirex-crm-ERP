"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const STAGES = new Set([
	"UNASSIGNED",
	"ASSIGNED",
	"TALKING",
	"INTERESTED",
	"REJECTED",
	"APPROVED",
] as const);
type Stage =
	| "UNASSIGNED"
	| "ASSIGNED"
	| "TALKING"
	| "INTERESTED"
	| "REJECTED"
	| "APPROVED";
type ZohoRow = {
	zohoId: string;
	name: string;
	companyName?: string;
	email?: string;
	phone?: string;
	stage?: Stage;
	source?: string;
	country?: string;
	notes?: string;
};

export function ZohoImporter() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [csv, setCsv] = useState("");
	const [fileName, setFileName] = useState<string | null>(null);
	const [result, setResult] = useState<{
		created: number;
		updated: number;
		failed: number;
	} | null>(null);
	const rows = parseZoho(csv);
	const imported = useMutation(
		trpc.leads.importZoho.mutationOptions({
			onSuccess: async (next) => {
				setResult(next);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.leads.board.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.dashboard.leadOverview.queryKey(),
					}),
				]);
				toast.success(
					`${next.created} leads created and ${next.updated} updated.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<>
			<section className="flex flex-col gap-4 border-y px-(--spacing-block-inline) py-5">
				<div className="flex flex-col gap-2">
					<label className="font-medium text-sm" htmlFor="zoho-file">
						Zoho Leads CSV
					</label>
					<Input
						accept=".csv,text/csv"
						id="zoho-file"
						onChange={async (event) => {
							const file = event.target.files?.[0];
							if (!file) return;
							setFileName(file.name);
							setCsv(await file.text());
						}}
						type="file"
					/>
					<p className="text-muted-foreground text-xs">
						Expected columns include Lead ID, Lead Name, Company, Email, Phone,
						Lead Status, Country, and Description.
					</p>
				</div>
				<Textarea
					aria-label="CSV preview"
					className="min-h-40 font-mono text-xs"
					onChange={(event) => setCsv(event.target.value)}
					placeholder="Paste a Zoho Leads CSV here"
					value={csv}
				/>
				<div className="flex flex-wrap items-center gap-3">
					<Button
						disabled={rows.length === 0 || imported.isPending}
						onClick={() => imported.mutate({ rows })}
					>
						{imported.isPending ? "Importing…" : `Import ${rows.length} leads`}
					</Button>
					<p className="text-muted-foreground text-sm">
						{fileName ?? "No file selected"}
					</p>
				</div>
			</section>
			{result ? (
				<section className="grid gap-3 px-(--spacing-block-inline) sm:grid-cols-3">
					<Result label="Created" value={result.created} />
					<Result label="Updated" value={result.updated} />
					<Result label="Failed" value={result.failed} />
				</section>
			) : null}
		</>
	);
}

function Result({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg border p-4">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="font-medium text-2xl">{value}</p>
		</div>
	);
}

function parseZoho(input: string): ZohoRow[] {
	const table = parseCsv(input);
	const header = table[0]?.map(normalize) ?? [];
	if (header.length === 0) return [];
	const value = (row: string[], ...names: string[]) => {
		for (const name of names) {
			const index = header.indexOf(normalize(name));
			if (index >= 0 && row[index]?.trim()) return row[index].trim();
		}
		return "";
	};
	return table.slice(1).flatMap((row) => {
		const zohoId = value(row, "Lead ID", "Record ID", "Id");
		const first = value(row, "First Name");
		const last = value(row, "Last Name");
		const name =
			value(row, "Lead Name", "Full Name") ||
			[first, last].filter(Boolean).join(" ");
		if (!zohoId || !name) return [];
		const stage = stageOf(value(row, "Lead Status", "Status"));
		return [
			{
				zohoId,
				name,
				companyName: value(row, "Company", "Company Name") || undefined,
				email: value(row, "Email") || undefined,
				phone: value(row, "Phone", "Mobile") || undefined,
				stage,
				source: value(row, "Lead Source", "Source") || "Zoho CRM",
				country: value(row, "Country") || undefined,
				notes: value(row, "Description", "Notes") || undefined,
			},
		];
	});
}

function stageOf(value: string): Stage | undefined {
	const normalized = normalize(value).replaceAll(" ", "_").toUpperCase();
	if (STAGES.has(normalized as Stage)) return normalized as Stage;
	if (/qualif|interest|hot/.test(normalize(value))) return "INTERESTED";
	if (/contact|follow|talk/.test(normalize(value))) return "TALKING";
	if (/convert|won|approve/.test(normalize(value))) return "APPROVED";
	if (/lost|reject|junk|unqualif/.test(normalize(value))) return "REJECTED";
	return undefined;
}

function normalize(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
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
		} else if (character === '"') {
			quoted = !quoted;
		} else if (character === "," && !quoted) {
			row.push(field);
			field = "";
		} else if ((character === "\n" || character === "\r") && !quoted) {
			if (character === "\r" && input[index + 1] === "\n") index += 1;
			row.push(field);
			if (row.some((cell) => cell.trim())) rows.push(row);
			row = [];
			field = "";
		} else {
			field += character;
		}
	}
	row.push(field);
	if (row.some((cell) => cell.trim())) rows.push(row);
	return rows;
}
