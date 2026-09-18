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
import { CommunicationsInbox } from "./communications-inbox";
import { CommunicationsLinks } from "./communications-links";

export const metadata: Metadata = { title: "Communications" };

export default function CommunicationsPage() {
	return (
		<PageShell contained className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Communications</PageShellTitle>
					<PageShellDescription>
						Email, WhatsApp, and internal notes in one lead conversation.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CommunicationsLinks />
				</PageShellActions>
			</PageShellHeader>
			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Inbox />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Inbox() {
	await requireSession();
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	await Promise.all([
		queryClient.prefetchQuery(trpc.communications.conversations.queryOptions()),
		queryClient.prefetchQuery(trpc.communications.status.queryOptions()),
		queryClient.prefetchQuery(trpc.templates.list.queryOptions()),
	]);
	return (
		<HydrateClient>
			<CommunicationsInbox />
		</HydrateClient>
	);
}
