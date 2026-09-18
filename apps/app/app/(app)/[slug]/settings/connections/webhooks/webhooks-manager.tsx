"use client";

import Add from "@carbon/icons-react/es/Add";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type Created = { path: string; secret: string };

export function WebhooksManager() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const webhooks = useQuery(trpc.webhooks.list.queryOptions());
	const [open, setOpen] = useState(false);
	const [created, setCreated] = useState<Created | null>(null);
	const create = useMutation(
		trpc.webhooks.create.mutationOptions({
			onSuccess: async (result) => {
				setCreated(result);
				await queryClient.invalidateQueries({
					queryKey: trpc.webhooks.list.queryKey(),
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		trpc.webhooks.update.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries({
					queryKey: trpc.webhooks.list.queryKey(),
				}),
			onError: (error) => toast.error(error.message),
		}),
	);
	return (
		<div className="flex flex-col gap-4">
			<div className="flex justify-end">
				<Sheet
					open={open}
					onOpenChange={(value) => {
						setOpen(value);
						if (!value) setCreated(null);
					}}
				>
					<SheetTrigger asChild>
						<Button size="sm">
							<Add data-icon="inline-start" />
							New webhook
						</Button>
					</SheetTrigger>
					<SheetContent>
						<SheetHeader>
							<SheetTitle>New lead webhook</SheetTitle>
							<SheetDescription>
								The secret appears once. Store it in the sending system.
							</SheetDescription>
						</SheetHeader>
						{created ? (
							<div className="flex flex-col gap-4 px-4">
								<Field>
									<FieldLabel>Endpoint path</FieldLabel>
									<Input readOnly value={created.path} />
								</Field>
								<Field>
									<FieldLabel>Secret</FieldLabel>
									<Input readOnly value={created.secret} />
								</Field>
								<p className="text-muted-foreground text-xs">
									Send JSON with name and either email or phone. Put the secret
									in the x-webhook-secret header.
								</p>
							</div>
						) : (
							<form
								id="new-webhook"
								className="px-4"
								onSubmit={(event) => {
									event.preventDefault();
									const data = new FormData(event.currentTarget);
									create.mutate({
										name: String(data.get("name") ?? ""),
										source: String(data.get("source") ?? ""),
									});
								}}
							>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="webhook-name">Name</FieldLabel>
										<Input
											id="webhook-name"
											name="name"
											placeholder="Fresh inbound leads"
											required
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="webhook-source">
											Default source
										</FieldLabel>
										<Input
											id="webhook-source"
											name="source"
											placeholder="Fresh"
											required
										/>
									</Field>
								</FieldGroup>
							</form>
						)}
						<SheetFooter>
							{created ? (
								<Button onClick={() => setOpen(false)}>Done</Button>
							) : (
								<Button
									form="new-webhook"
									type="submit"
									disabled={create.isPending}
								>
									Create webhook
								</Button>
							)}
						</SheetFooter>
					</SheetContent>
				</Sheet>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				{webhooks.data?.map((webhook) => (
					<Card key={webhook.id}>
						<CardHeader>
							<div className="flex items-start justify-between gap-3">
								<div>
									<CardTitle>{webhook.name}</CardTitle>
									<CardDescription>Source: {webhook.source}</CardDescription>
								</div>
								<Badge variant={webhook.enabled ? "default" : "outline"}>
									{webhook.enabled ? "Active" : "Disabled"}
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="flex items-center justify-between gap-4">
							<p className="text-muted-foreground text-xs">
								{webhook.lastReceivedAt
									? `Last received ${webhook.lastReceivedAt.toLocaleString()}`
									: "Waiting for first request"}
							</p>
							<Button
								size="sm"
								variant="outline"
								disabled={update.isPending}
								onClick={() =>
									update.mutate({ id: webhook.id, enabled: !webhook.enabled })
								}
							>
								{webhook.enabled ? "Disable" : "Enable"}
							</Button>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
