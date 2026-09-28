"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsBoolean, useQueryState } from "nuqs";
import { type ComponentProps, Suspense, useId, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const UNASSIGNED = "unassigned";
const NONE = "none";
const PORTAL_STATUSES = ["NOT_REGISTERED", "REGISTERED"] as const;

type PortalStatus = (typeof PORTAL_STATUSES)[number];
type AccountType = (typeof LEAD_BOARD.kinds)[number];

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={Add} data-icon="inline-start" />
			New company
		</Button>
	);
}

export function CreateCompanySheet() {
	return (
		<Suspense fallback={<AddButton disabled />}>
			<CreateCompanyForm />
		</Suspense>
	);
}

function CreateCompanyForm() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.create,
		parseAsBoolean.withDefault(false),
	);
	const [ownerId, setOwnerId] = useState(UNASSIGNED);
	const [accountType, setAccountType] = useState(NONE);
	const [portalStatus, setPortalStatus] =
		useState<PortalStatus>("NOT_REGISTERED");

	const id = useId();
	const field = (name: string) => `${id}-${name}`;

	const users = useQuery(trpc.users.list.queryOptions());

	const create = useMutation(
		trpc.companies.create.mutationOptions({
			onSuccess: async (company) => {
				await cache.company(company.id);
				toast.success(`${company.name} added.`);
				await setOpen(null);
				setOwnerId(UNASSIGNED);
				setAccountType(NONE);
				setPortalStatus("NOT_REGISTERED");
				openRecord({ kind: "company", id: company.id });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>New company</SheetTitle>
					<SheetDescription>
						Fields marked * are required. The contact becomes the account's
						primary contact.
					</SheetDescription>
				</SheetHeader>

				<form
					id="create-company"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const text = (key: string) => {
							const value = String(form.get(key) ?? "").trim();
							return value === "" ? undefined : value;
						};
						const count = (key: string) => {
							const value = Number.parseInt(text(key) ?? "", 10);
							return Number.isFinite(value) && value >= 0 ? value : undefined;
						};

						const name = text("name");
						const contactName = text("contactName");
						if (!name || !contactName) return;

						create.mutate({
							name,
							contactName,
							ownerId: ownerId === UNASSIGNED ? null : ownerId,
							accountType:
								accountType === NONE ? null : (accountType as AccountType),
							email: text("email"),
							website: text("website"),
							country: text("country"),
							state: text("state"),
							address: text("address"),
							operatingRegions: text("operatingRegions"),
							installationType: text("installationType"),
							portalStatus,
							onboardedAt: text("onboardedAt") ?? null,
							portalSubmissions: count("portalSubmissions"),
							customersReferred: count("customersReferred"),
							notes: text("notes"),
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={field("owner")}>Account owner</FieldLabel>
							<Select value={ownerId} onValueChange={setOwnerId}>
								<SelectTrigger id={field("owner")}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
									{(users.data ?? []).map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("name")}>Account name *</FieldLabel>
							<Input
								id={field("name")}
								name="name"
								placeholder="EPC company name"
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("type")}>Account type</FieldLabel>
							<Select value={accountType} onValueChange={setAccountType}>
								<SelectTrigger id={field("type")}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>Not set</SelectItem>
									{LEAD_BOARD.kinds.map((kind) => (
										<SelectItem key={kind} value={kind}>
											{LEAD_BOARD.kind[kind]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("contactName")}>
								Contact name *
							</FieldLabel>
							<Input
								id={field("contactName")}
								name="contactName"
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("email")}>Email</FieldLabel>
							<Input
								id={field("email")}
								name="email"
								type="email"
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("country")}>Country</FieldLabel>
							<Input id={field("country")} name="country" placeholder="India" />
						</Field>

						<Field>
							<FieldLabel htmlFor={field("state")}>State</FieldLabel>
							<Input id={field("state")} name="state" />
						</Field>

						<Field>
							<FieldLabel htmlFor={field("address")}>Address</FieldLabel>
							<Textarea id={field("address")} name="address" rows={2} />
						</Field>

						<Field>
							<FieldLabel htmlFor={field("website")}>Website</FieldLabel>
							<Input
								id={field("website")}
								name="website"
								placeholder="https://"
								inputMode="url"
								autoComplete="off"
							/>
							<FieldDescription>
								Used to fetch the company logo when no other account has it.
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("regions")}>
								Operating regions
							</FieldLabel>
							<Input
								id={field("regions")}
								name="operatingRegions"
								placeholder="e.g. Kerala, Tamil Nadu"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("installation")}>
								Installation type
							</FieldLabel>
							<Input
								id={field("installation")}
								name="installationType"
								placeholder="e.g. Rooftop, ground-mount"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("portal")}>
								EPC portal status
							</FieldLabel>
							<Select
								value={portalStatus}
								onValueChange={(next) => setPortalStatus(next as PortalStatus)}
							>
								<SelectTrigger id={field("portal")}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PORTAL_STATUSES.map((status) => (
										<SelectItem key={status} value={status}>
											{LEAD_BOARD.portalStatus[status]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("onboarded")}>
								Onboarding date
							</FieldLabel>
							<Input id={field("onboarded")} name="onboardedAt" type="date" />
						</Field>

						<Field>
							<FieldLabel htmlFor={field("submissions")}>
								Total portal submissions
							</FieldLabel>
							<Input
								id={field("submissions")}
								name="portalSubmissions"
								type="number"
								min={0}
								step={1}
								placeholder="0"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("referred")}>
								Total customers referred
							</FieldLabel>
							<Input
								id={field("referred")}
								name="customersReferred"
								type="number"
								min={0}
								step={1}
								placeholder="0"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={field("notes")}>Notes</FieldLabel>
							<Textarea id={field("notes")} name="notes" rows={3} />
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="create-company"
						disabled={create.isPending}
					>
						{create.isPending ? <Spinner /> : null}
						Add company
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
