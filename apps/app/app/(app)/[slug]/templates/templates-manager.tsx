"use client";

import Add from "@carbon/icons-react/es/Add";
import Renew from "@carbon/icons-react/es/Renew";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

export function TemplatesManager() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const templates = useQuery({
		...trpc.templates.list.queryOptions(),
		refetchInterval: 60_000,
	});
	const metaStatus = useQuery({
		...trpc.templates.metaSyncStatus.queryOptions(),
		refetchInterval: 60_000,
	});
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const [open, setOpen] = useState(false);
	const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP" | "NOTE">(
		"EMAIL",
	);
	const create = useMutation(
		trpc.templates.create.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.templates.list.queryKey(),
				});
				setOpen(false);
				toast.success("Template created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		trpc.templates.update.mutationOptions({
			onSuccess: async (template) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.templates.list.queryKey(),
				});
				toast.success(
					template.active ? "Template activated." : "Template deactivated.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const syncMeta = useMutation(
		trpc.templates.syncMeta.mutationOptions({
			onSuccess: async (result) => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.templates.list.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.templates.metaSyncStatus.queryKey(),
					}),
				]);
				toast.success(
					`${result.approved} approved Meta templates synchronized.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const configureMeta = useMutation(
		trpc.templates.configureMeta.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.templates.metaSyncStatus.queryKey(),
				});
				toast.success("WhatsApp business account saved.");
				syncMeta.mutate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const canManage = workspace.data?.canManageTemplates === true;
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/25 px-4 py-3">
				<div>
					<p className="font-medium text-sm">WhatsApp templates from Meta</p>
					<p className="text-muted-foreground text-xs">
						{!metaStatus.data?.accessTokenConfigured
							? "Add the WhatsApp access token to the API configuration."
							: metaStatus.data.configured
								? "Approved templates refresh automatically every 15 minutes."
								: "Enter the Meta WhatsApp business account ID once."}
						{metaStatus.data?.lastSyncedAt ? (
							<>
								{" Last refreshed "}
								<LocalRelativeTime date={metaStatus.data.lastSyncedAt} />.
							</>
						) : null}
					</p>
					{metaStatus.data?.lastError ? (
						<p className="mt-1 text-destructive text-xs">
							{metaStatus.data.lastError}
						</p>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{metaStatus.data?.accessTokenConfigured &&
					!metaStatus.data.businessAccountId ? (
						<form
							className="flex items-center gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								const data = new FormData(event.currentTarget);
								configureMeta.mutate({
									businessAccountId: String(
										data.get("businessAccountId") ?? "",
									).trim(),
								});
							}}
						>
							<Input
								className="w-52"
								name="businessAccountId"
								inputMode="numeric"
								placeholder="Business account ID"
								required
							/>
							<Button
								type="submit"
								size="sm"
								disabled={!canManage || configureMeta.isPending}
							>
								Save
							</Button>
						</form>
					) : (
						<Button
							variant="outline"
							size="sm"
							disabled={
								!canManage || !metaStatus.data?.configured || syncMeta.isPending
							}
							onClick={() => syncMeta.mutate()}
						>
							{syncMeta.isPending ? (
								<Spinner data-icon="inline-start" />
							) : (
								<Renew data-icon="inline-start" />
							)}
							Refresh from Meta
						</Button>
					)}
					<Sheet open={open} onOpenChange={setOpen}>
						<SheetTrigger asChild>
							<Button size="sm" disabled={!canManage}>
								<Add data-icon="inline-start" />
								New template
							</Button>
						</SheetTrigger>
						<SheetContent>
							<SheetHeader>
								<SheetTitle>New template</SheetTitle>
								<SheetDescription>
									Create reusable content for the team.
								</SheetDescription>
							</SheetHeader>
							<form
								id="new-template"
								className="overflow-y-auto px-4"
								onSubmit={(event) => {
									event.preventDefault();
									const data = new FormData(event.currentTarget);
									const value = (name: string) =>
										String(data.get(name) ?? "").trim();
									create.mutate({
										name: value("name"),
										channel,
										subject: value("subject") || undefined,
										body: value("body"),
										providerTemplateName:
											value("providerTemplateName") || undefined,
										language: value("language") || "en_US",
									});
								}}
							>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="template-name">Name</FieldLabel>
										<Input id="template-name" name="name" required />
									</Field>
									<Field>
										<FieldLabel>Channel</FieldLabel>
										<Select
											value={channel}
											onValueChange={(value) =>
												setChannel(value as typeof channel)
											}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="EMAIL">Email</SelectItem>
												<SelectItem
													value="WHATSAPP"
													disabled={metaStatus.data?.configured}
												>
													WhatsApp
												</SelectItem>
												<SelectItem value="NOTE">Note</SelectItem>
											</SelectContent>
										</Select>
									</Field>
									{channel === "EMAIL" ? (
										<Field>
											<FieldLabel htmlFor="template-subject">
												Subject
											</FieldLabel>
											<Input id="template-subject" name="subject" />
										</Field>
									) : null}
									{channel === "WHATSAPP" ? (
										<>
											<Field>
												<FieldLabel htmlFor="provider-name">
													Meta template name
												</FieldLabel>
												<Input id="provider-name" name="providerTemplateName" />
											</Field>
											<Field>
												<FieldLabel htmlFor="template-language">
													Language
												</FieldLabel>
												<Input
													id="template-language"
													name="language"
													defaultValue="en_US"
												/>
											</Field>
										</>
									) : null}
									<Field>
										<FieldLabel htmlFor="template-body">Message</FieldLabel>
										<Textarea
											id="template-body"
											name="body"
											rows={8}
											required
										/>
									</Field>
								</FieldGroup>
							</form>
							<SheetFooter>
								<Button
									type="submit"
									form="new-template"
									disabled={create.isPending}
								>
									Create template
								</Button>
							</SheetFooter>
						</SheetContent>
					</Sheet>
				</div>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{templates.data?.map((template) => (
					<Card
						key={template.id}
						className={!template.active ? "opacity-65" : undefined}
					>
						<CardHeader>
							<div className="flex items-start justify-between gap-3">
								<div>
									<CardTitle>{template.name}</CardTitle>
									<CardDescription>
										{template.subject ?? "Reusable message"}
									</CardDescription>
								</div>
								<div className="flex items-center gap-2">
									{template.providerTemplateId ? (
										<Badge variant="secondary">Meta approved</Badge>
									) : null}
									{!template.active ? (
										<Badge variant="secondary">Inactive</Badge>
									) : null}
									<Badge variant="outline">{template.channel}</Badge>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<p className="line-clamp-5 whitespace-pre-wrap text-muted-foreground text-sm">
								{template.body}
							</p>
							{template.providerTemplateId ? (
								<p className="mt-3 text-muted-foreground text-xs">
									{template.providerTemplateName} · {template.language}
								</p>
							) : (
								<Button
									variant="ghost"
									size="sm"
									className="mt-3 px-0"
									disabled={!canManage || update.isPending}
									onClick={() =>
										update.mutate({ id: template.id, active: !template.active })
									}
								>
									{template.active ? "Deactivate" : "Activate"}
								</Button>
							)}
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
