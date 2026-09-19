"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
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
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function CreateLeadSheet() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [open, setOpen] = useState(false);
	const [kind, setKind] = useState("EPC");
	const [entity, setEntity] = useState("NONE");

	const create = useMutation(
		trpc.leads.create.mutationOptions({
			onSuccess: (lead) => {
				toast.success(`${lead.name} added to Unassigned.`);
				setOpen(false);
				void Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.leads.board.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.leads.column.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.leads.list.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.dashboard.leadOverview.queryKey(),
					}),
				]);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Sheet onOpenChange={setOpen} open={open}>
			<SheetTrigger asChild>
				<Button size="sm">
					<Add data-icon="inline-start" />
					New lead
				</Button>
			</SheetTrigger>

			<SheetContent className="flex flex-col">
				<SheetHeader>
					<SheetTitle>New lead</SheetTitle>
					<SheetDescription>
						It lands in Unassigned until somebody picks it up.
					</SheetDescription>
				</SheetHeader>

				<form
					className="flex min-h-0 flex-1 flex-col"
					id="create-lead"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const text = (key: string) => {
							const value = String(form.get(key) ?? "").trim();
							return value === "" ? undefined : value;
						};

						const name = text("name");
						if (!name) return;

						create.mutate({
							name,
							companyName: text("companyName"),
							email: text("email"),
							phone: text("phone"),
							source: text("source"),
							country: text("country"),
							notes: text("notes"),
							kind: kind as "EPC" | "CUSTOMER" | "OTHER",
							entity:
								entity === "NONE" ? undefined : (entity as "INDIA" | "GERMANY"),
							stage: "UNASSIGNED",
						});
					}}
				>
					<div className="min-h-0 flex-1 overflow-y-auto px-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="lead-name">Name</FieldLabel>
								<Input
									autoFocus
									id="lead-name"
									name="name"
									placeholder="Contact or organisation"
									required
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-company">Company</FieldLabel>
								<Input
									id="lead-company"
									name="companyName"
									placeholder="e.g. Tata Power Solar"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-kind">Type</FieldLabel>
								<Select onValueChange={setKind} value={kind}>
									<SelectTrigger id="lead-kind">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="EPC">EPC</SelectItem>
										<SelectItem value="CUSTOMER">Customer</SelectItem>
										<SelectItem value="OTHER">Other</SelectItem>
									</SelectContent>
								</Select>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-entity">Navirex entity</FieldLabel>
								<Select onValueChange={setEntity} value={entity}>
									<SelectTrigger id="lead-entity">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="NONE">Not set</SelectItem>
										<SelectItem value="INDIA">Navirex India</SelectItem>
										<SelectItem value="GERMANY">Navirex Germany</SelectItem>
									</SelectContent>
								</Select>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-email">Email</FieldLabel>
								<Input
									id="lead-email"
									name="email"
									placeholder="name@company.com"
									type="email"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-phone">Phone</FieldLabel>
								<Input
									id="lead-phone"
									name="phone"
									placeholder="+91 …"
									type="tel"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-country">Country</FieldLabel>
								<Input id="lead-country" name="country" placeholder="India" />
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-source">Source</FieldLabel>
								<Input
									id="lead-source"
									name="source"
									placeholder="Referral, website, event…"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-notes">Notes</FieldLabel>
								<Textarea id="lead-notes" name="notes" rows={4} />
							</Field>
						</FieldGroup>
					</div>

					<SheetFooter>
						<Button disabled={create.isPending} type="submit">
							{create.isPending ? <Spinner data-icon="inline-start" /> : null}
							Create lead
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
