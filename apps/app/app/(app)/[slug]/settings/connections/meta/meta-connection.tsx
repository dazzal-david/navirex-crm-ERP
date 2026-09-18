"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function MetaConnection({ slug }: { slug: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [opening, setOpening] = useState(false);
	const status = useQuery(trpc.meta.status.queryOptions());
	const pages = useQuery({
		...trpc.meta.pages.queryOptions(),
		enabled: status.data?.linked === true,
	});
	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: trpc.meta.status.queryKey() }),
			queryClient.invalidateQueries({ queryKey: trpc.meta.pages.queryKey() }),
		]);
	};
	const connect = useMutation(
		trpc.meta.connect.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Meta page connected.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const disconnect = useMutation(
		trpc.meta.disconnect.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Meta page disconnected.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const sync = useMutation(
		trpc.meta.sync.mutationOptions({
			onSuccess: async (result) => {
				await refresh();
				toast.success(
					`${result.created} new leads imported; ${result.matched} matched existing leads.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (status.isPending)
		return (
			<div className="flex justify-center py-10">
				<Spinner />
			</div>
		);
	if (status.error)
		return (
			<p className="px-(--spacing-block-inline) text-destructive text-sm">
				{status.error.message}
			</p>
		);
	const data = status.data;
	if (!data) return null;

	return (
		<>
			<section className="flex flex-col gap-4 border-y px-(--spacing-block-inline) py-5">
				<div className="flex flex-wrap items-center gap-3">
					<StatusIndicator
						tone={data.linked && data.webhookConfigured ? "success" : "warning"}
						label={data.linked ? "Meta account linked" : "Setup required"}
					/>
					{data.linked ? (
						<Button
							disabled={sync.isPending || data.pages.length === 0}
							onClick={() => sync.mutate()}
							size="sm"
						>
							{sync.isPending ? "Synchronizing…" : "Synchronize leads"}
						</Button>
					) : (
						<Button
							disabled={!data.configured || opening}
							onClick={async () => {
								setOpening(true);
								const { error } = await authClient.oauth2.link({
									providerId: "meta",
									callbackURL: `${window.location.origin}/${slug}/settings/connections/meta`,
									errorCallbackURL: `${window.location.origin}/${slug}/settings/connections/meta`,
								});
								if (error)
									toast.error(error.message || "Could not connect Meta.");
								setOpening(false);
							}}
						>
							{opening
								? "Opening Meta…"
								: data.configured
									? "Connect Meta Business"
									: "Meta credentials required"}
						</Button>
					)}
				</div>
				<div className="grid gap-3 text-sm sm:grid-cols-2">
					<Fact label="Webhook URL" value={data.webhookUrl} />
					<Fact
						label="Delivery"
						value="New submissions and historical form leads"
					/>
				</div>
			</section>

			{data.linked ? (
				<section className="flex flex-col gap-3 px-(--spacing-block-inline)">
					<div>
						<h2 className="font-medium text-sm">Business pages</h2>
						<p className="text-muted-foreground text-sm">
							Choose every page whose instant forms should create CRM leads.
						</p>
					</div>
					{pages.isPending ? <Spinner /> : null}
					{pages.error ? (
						<p className="text-destructive text-sm">{pages.error.message}</p>
					) : null}
					<div className="flex flex-col divide-y rounded-lg border">
						{(pages.data ?? []).map((page) => (
							<div className="flex items-center gap-3 px-4 py-3" key={page.id}>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">{page.name}</p>
									<p className="text-muted-foreground text-xs">
										{page.connected ? "Webhook active" : "Available to connect"}
									</p>
								</div>
								<Button
									disabled={connect.isPending || disconnect.isPending}
									onClick={() =>
										page.connected
											? disconnect.mutate({ pageId: page.id })
											: connect.mutate({ pageId: page.id })
									}
									size="sm"
									variant={page.connected ? "outline" : "default"}
								>
									{page.connected ? "Disconnect" : "Connect"}
								</Button>
							</div>
						))}
					</div>
				</section>
			) : null}
		</>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 rounded-lg border p-4">
			<span className="font-medium">{label}</span>
			<span className="break-all text-muted-foreground">{value}</span>
		</div>
	);
}
