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
import { TemplatesManager } from "./templates-manager";

export const metadata: Metadata = { title: "Message templates" };

export default function TemplatesPage() {
	return (
		<Suspense fallback={<PageShellLoading />}>
			<TemplatesPageContent />
		</Suspense>
	);
}

async function TemplatesPageContent() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	await queryClient.prefetchQuery(trpc.templates.list.queryOptions());
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Templates</PageShellTitle>
					<PageShellDescription>
						Reusable email, WhatsApp, and internal-note content.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<TemplatesManager />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
