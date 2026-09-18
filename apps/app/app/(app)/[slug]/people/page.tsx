import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
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
import { PeopleManager } from "./people-manager";

export const metadata: Metadata = { title: "Human resources" };

export default function PeoplePage() {
	return (
		<Suspense fallback={<PageShellLoading />}>
			<PeoplePageContent />
		</Suspense>
	);
}

async function PeoplePageContent() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	await Promise.all([
		queryClient.prefetchQuery(trpc.people.directory.queryOptions()),
		queryClient.prefetchQuery(trpc.people.reimbursements.queryOptions()),
	]);
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Human resources</PageShellTitle>
					<PageShellDescription>
						Staff directory and reimbursement approvals.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<PeopleManager />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
