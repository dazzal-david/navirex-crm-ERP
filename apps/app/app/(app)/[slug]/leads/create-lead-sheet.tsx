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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { useTRPC } from "@/lib/trpc/client";

type LeadKind = (typeof LEAD_BOARD.kinds)[number];
type LeadStage = (typeof LEAD_BOARD.stages)[number];

const NONE = "NONE";

export function CreateLeadSheet() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [open, setOpen] = useState(false);
	const [kind, setKind] = useState<LeadKind>("EPC");
	const [entity, setEntity] = useState(NONE);
	const [ownerId, setOwnerId] = useState(NONE);
	const [stage, setStage] = useState<LeadStage>("NOT_CONTACTED");

	const owners = useQuery(trpc.leads.owners.queryOptions());
	const hasDesignation = (
		LEAD_BOARD.designationKinds as readonly string[]
	).includes(kind);

	const create = useMutation(
		trpc.leads.create.mutationOptions({
			onSuccess: (lead) => {
				toast.success(`${lead.name} added to ${LEAD_BOARD.label[lead.stage]}.`);
				setOpen(false);
				setKind("EPC");
				setEntity(NONE);
				setOwnerId(NONE);
				setStage("NOT_CONTACTED");
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
						Fields marked * are required. Everything else can be filled in later
						from the lead.
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
						const companyName = text("companyName");
						const phone = text("phone");
						if (!name || !companyName || !phone) return;

						create.mutate({
							kind,
							name,
							designation: hasDesignation ? text("designation") : undefined,
							companyName,
							entity:
								entity === NONE ? undefined : (entity as "INDIA" | "GERMANY"),
							phone,
							secondaryPhone: text("secondaryPhone"),
							email: text("email"),
							secondaryEmail: text("secondaryEmail"),
							website: text("website"),
							source: text("source"),
							country: text("country"),
							state: text("state"),
							address: text("address"),
							nextAction: text("nextAction"),
							ownerId: ownerId === NONE ? undefined : ownerId,
							stage,
							notes: text("notes"),
						});
					}}
				>
					<div className="min-h-0 flex-1 overflow-y-auto px-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="lead-kind">Lead category *</FieldLabel>
								<Select
									onValueChange={(next) => setKind(next as LeadKind)}
									value={kind}
								>
									<SelectTrigger id="lead-kind">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{LEAD_BOARD.kinds.map((option) => (
											<SelectItem key={option} value={option}>
												{LEAD_BOARD.kind[option]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-name">Name *</FieldLabel>
								<Input
									autoFocus
									id="lead-name"
									name="name"
									placeholder="Person you are talking to"
									required
								/>
							</Field>

							{hasDesignation ? (
								<Field>
									<FieldLabel htmlFor="lead-designation">
										Designation / role
									</FieldLabel>
									<Input
										id="lead-designation"
										name="designation"
										placeholder="e.g. Procurement head"
									/>
								</Field>
							) : null}

							<Field>
								<FieldLabel htmlFor="lead-company">Company *</FieldLabel>
								<Input
									id="lead-company"
									name="companyName"
									placeholder="e.g. Tata Power Solar"
									required
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-entity">Navirex entity</FieldLabel>
								<Select onValueChange={setEntity} value={entity}>
									<SelectTrigger id="lead-entity">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>Not set</SelectItem>
										{LEAD_BOARD.entities.map((option) => (
											<SelectItem key={option} value={option}>
												{LEAD_BOARD.entityName[option]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-phone">Mobile number *</FieldLabel>
								<Input
									id="lead-phone"
									name="phone"
									placeholder="+91 …"
									required
									type="tel"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-secondary-phone">
									Secondary phone
								</FieldLabel>
								<Input
									id="lead-secondary-phone"
									name="secondaryPhone"
									type="tel"
								/>
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
								<FieldLabel htmlFor="lead-secondary-email">
									Secondary email
								</FieldLabel>
								<Input
									id="lead-secondary-email"
									name="secondaryEmail"
									type="email"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-website">Website</FieldLabel>
								<Input
									id="lead-website"
									name="website"
									placeholder="https://"
									type="url"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-source">Lead source</FieldLabel>
								<Input
									id="lead-source"
									name="source"
									placeholder="Referral, website, event…"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-country">Country</FieldLabel>
								<Input id="lead-country" name="country" placeholder="India" />
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-state">State</FieldLabel>
								<Input id="lead-state" name="state" placeholder="Kerala" />
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-address">Address</FieldLabel>
								<Textarea id="lead-address" name="address" rows={2} />
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-next-action">Next action</FieldLabel>
								<Input
									id="lead-next-action"
									name="nextAction"
									placeholder="e.g. Send proposal on Friday"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-owner">Lead owner</FieldLabel>
								<Select onValueChange={setOwnerId} value={ownerId}>
									<SelectTrigger id="lead-owner">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>Unassigned</SelectItem>
										{(owners.data ?? []).map((owner) => (
											<SelectItem key={owner.id} value={owner.id}>
												{owner.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field>
								<FieldLabel htmlFor="lead-status">Lead status</FieldLabel>
								<Select
									onValueChange={(next) => setStage(next as LeadStage)}
									value={stage}
								>
									<SelectTrigger id="lead-status">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{LEAD_BOARD.stages.map((option) => (
											<SelectItem key={option} value={option}>
												{LEAD_BOARD.label[option]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
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
