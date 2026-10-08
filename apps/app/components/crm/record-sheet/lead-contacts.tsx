"use client";

import Add from "@carbon/icons-react/es/Add";
import Star from "@carbon/icons-react/es/Star";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { InlineTextCell } from "@/components/crm/inline-field";
import { PhoneInput } from "@/components/crm/phone-input";
import { DetailSheetProperties } from "@/components/detail-sheet";
import { useTRPC } from "@/lib/trpc/client";

export function LeadContacts({
	leadId,
	mainCard,
}: {
	leadId: string;
	mainCard: React.ReactNode;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const contacts = useQuery(trpc.leads.contactsOf.queryOptions({ id: leadId }));
	const [adding, setAdding] = useState(false);

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.leads.contactsOf.queryKey({ id: leadId }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.leads.byId.queryKey({ id: leadId }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.communications.recipients.queryKey({ leadId }),
			}),
			queryClient.invalidateQueries({ queryKey: trpc.leads.board.queryKey() }),
			queryClient.invalidateQueries({
				queryKey: trpc.leads.column.pathKey(),
			}),
			queryClient.invalidateQueries({ queryKey: trpc.leads.list.pathKey() }),
		]);

	const remove = useMutation(
		trpc.leads.removeContact.mutationOptions({
			onSuccess: async () => {
				toast.success("Contact removed.");
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const makePrimary = useMutation(
		trpc.leads.makePrimaryContact.mutationOptions({
			onSuccess: async () => {
				toast.success("Main contact changed.");
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const update = useMutation(
		trpc.leads.updateContact.mutationOptions({
			onSuccess: () => refresh(),
			onError: (error) => toast.error(error.message),
		}),
	);

	const busy = remove.isPending || makePrimary.isPending;

	return (
		<div className="flex flex-col gap-3">
			{mainCard}
			{(contacts.data ?? []).map((contact) => (
				<PersonCard
					actions={
						<>
							<Button
								disabled={busy}
								onClick={() => makePrimary.mutate({ id: contact.id })}
								size="sm"
								variant="ghost"
							>
								<Icon data-icon="inline-start" icon={Star} />
								Make main
							</Button>
							<Button
								aria-label={`Remove ${contact.name}`}
								disabled={busy}
								onClick={() => {
									if (
										window.confirm(`Remove ${contact.name} from this lead?`)
									) {
										remove.mutate({ id: contact.id });
									}
								}}
								size="icon-sm"
								variant="ghost"
							>
								<Icon icon={TrashCan} />
							</Button>
						</>
					}
					key={contact.id}
					name={contact.name}
				>
					<InlineTextCell
						label="Name"
						onSave={(next) => {
							if (next) update.mutate({ id: contact.id, name: next });
						}}
						placeholder="Add a name"
						saving={update.isPending}
						value={contact.name}
					/>
					<InlineTextCell
						label="Designation / role"
						onSave={(next) =>
							update.mutate({ id: contact.id, designation: next })
						}
						placeholder="Add a designation"
						saving={update.isPending}
						value={contact.designation}
					/>
					<InlineTextCell
						label="Mobile number"
						onSave={(next) => update.mutate({ id: contact.id, phone: next })}
						placeholder="Add a phone number"
						saving={update.isPending}
						value={contact.phone}
					/>
					<InlineTextCell
						label="Email"
						onSave={(next) => update.mutate({ id: contact.id, email: next })}
						placeholder="Add an email"
						saving={update.isPending}
						value={contact.email}
					/>
				</PersonCard>
			))}
			<Button
				className="self-start"
				onClick={() => setAdding(true)}
				size="sm"
				variant="outline"
			>
				<Icon data-icon="inline-start" icon={Add} />
				Add contact
			</Button>
			{adding ? (
				<ContactDialog
					leadId={leadId}
					onClose={() => setAdding(false)}
					onSaved={refresh}
				/>
			) : null}
		</div>
	);
}

export function PersonCard({
	name,
	actions,
	children,
}: {
	name: string;
	actions: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-2xl border bg-card p-4 shadow-xs">
			<div className="mb-2 flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate font-medium text-sm">
					{name}
				</span>
				<div className="flex shrink-0 items-center gap-1">{actions}</div>
			</div>
			<DetailSheetProperties>{children}</DetailSheetProperties>
		</div>
	);
}

function ContactDialog({
	leadId,
	onClose,
	onSaved,
}: {
	leadId: string;
	onClose: () => void;
	onSaved: () => Promise<unknown>;
}) {
	const trpc = useTRPC();
	const nameId = useId();
	const designationId = useId();
	const phoneId = useId();
	const emailId = useId();

	const add = useMutation(
		trpc.leads.addContact.mutationOptions({
			onSuccess: async () => {
				toast.success("Contact added.");
				await onSaved();
				onClose();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			open
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add contact</DialogTitle>
					<DialogDescription>
						Another person at this company. The lead keeps one owner and one
						status.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const text = (key: string) => String(form.get(key) ?? "").trim();
						const name = text("name");
						if (!name) return;
						add.mutate({
							leadId,
							name,
							designation: text("designation"),
							phone: text("phone"),
							email: text("email"),
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={nameId}>Name *</FieldLabel>
							<Input autoFocus id={nameId} name="name" required />
						</Field>
						<Field>
							<FieldLabel htmlFor={designationId}>
								Designation / role
							</FieldLabel>
							<Input
								id={designationId}
								name="designation"
								placeholder="e.g. Procurement head"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={phoneId}>Mobile number</FieldLabel>
							<PhoneInput id={phoneId} label="Mobile number" name="phone" />
						</Field>
						<Field>
							<FieldLabel htmlFor={emailId}>Email</FieldLabel>
							<Input
								id={emailId}
								name="email"
								placeholder="name@company.com"
								type="email"
							/>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<Button disabled={add.isPending} type="submit">
							{add.isPending ? <Spinner data-icon="inline-start" /> : null}
							Add contact
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
