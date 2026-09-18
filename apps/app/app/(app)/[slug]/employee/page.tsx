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
import { EmployeePortal } from "./employee-portal";

export const metadata: Metadata = { title: "Employee portal" };

export default function EmployeePage() {
	return (
		<Suspense fallback={<PageShellLoading />}>
			<EmployeePageContent />
		</Suspense>
	);
}

async function EmployeePageContent() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	await Promise.all([
		queryClient.prefetchQuery(trpc.people.me.queryOptions()),
		queryClient.prefetchQuery(trpc.people.myReimbursements.queryOptions()),
	]);
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Employee portal</PageShellTitle>
					<PageShellDescription>
						Your Navirex profile and reimbursement requests.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<EmployeePortal />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
