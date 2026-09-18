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
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function TemplatesManager() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const templates = useQuery(trpc.templates.list.queryOptions());
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
	const canManage = workspace.data?.canManageTemplates === true;
	return (
		<div className="flex flex-col gap-4">
			<div className="flex justify-end">
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
											<SelectItem value="WHATSAPP">WhatsApp</SelectItem>
											<SelectItem value="NOTE">Note</SelectItem>
										</SelectContent>
									</Select>
								</Field>
								{channel === "EMAIL" ? (
									<Field>
										<FieldLabel htmlFor="template-subject">Subject</FieldLabel>
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
									<Textarea id="template-body" name="body" rows={8} required />
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
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
