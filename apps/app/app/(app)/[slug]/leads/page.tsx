import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CreateLeadSheet } from "./create-lead-sheet";
import { LeadBoard } from "./lead-board";
import { loadLeadSearchParams, toLeadFilters } from "./leads-search-params";

export const metadata: Metadata = {
	title: "Leads",
};

export default function LeadsPage({
	searchParams,
}: PageProps<"/[slug]/leads">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader className="rounded-[1.75rem] border bg-gradient-to-br from-emerald-50 via-background to-amber-50 p-6 shadow-sm dark:from-emerald-950/30 dark:to-amber-950/20 md:p-8">
				<PageShellHeading>
					<PageShellTitle>Leads</PageShellTitle>
					<PageShellDescription>
						Every EPC and customer in the pipeline, from first contact to
						approved.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateLeadSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Board searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Board({
	searchParams,
}: Pick<PageProps<"/[slug]/leads">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		loadLeadSearchParams(searchParams),
	]);
	const filters = toLeadFilters(values);

	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await Promise.all([
		queryClient.prefetchQuery(trpc.leads.board.queryOptions(filters)),
		queryClient.prefetchQuery(trpc.leads.owners.queryOptions()),
	]);

	return (
		<HydrateClient>
			<LeadBoard />
		</HydrateClient>
	);
}
