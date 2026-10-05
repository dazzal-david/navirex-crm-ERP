"use client";

import Chat from "@carbon/icons-react/es/Chat";
import Email from "@carbon/icons-react/es/Email";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	type EmailAttachmentFile,
	EmailAttachmentPicker,
} from "@/components/crm/email/email-attachment-picker";
import { WhatsAppMediaComposer } from "@/components/crm/whatsapp/whatsapp-media-composer";
import {
	templateDefaults,
	templateReady,
	WhatsAppTemplateFields,
	type WhatsAppTemplateFieldsValue,
} from "@/components/crm/whatsapp/whatsapp-template-fields";
import { WhatsAppTemplatePreview } from "@/components/crm/whatsapp/whatsapp-template-preview";
import { WhatsAppWindowAlert } from "@/components/crm/whatsapp/whatsapp-window-alert";
import { WHATSAPP_UI } from "@/lib/communications/whatsapp-config";
import { useTRPC } from "@/lib/trpc/client";

type Channel = "email" | "whatsapp";

export function LeadCommunicationActions({
	leadId,
	email,
	phone,
}: {
	leadId: string;
	email: string | null;
	phone: string | null;
}) {
	const [channel, setChannel] = useState<Channel | null>(null);
	return (
		<>
			<Button
				disabled={!email}
				onClick={() => setChannel("email")}
				size="sm"
				variant="outline"
			>
				<Icon data-icon="inline-start" icon={Email} />
				Email
			</Button>
			<Button
				disabled={!phone}
				onClick={() => setChannel("whatsapp")}
				size="sm"
				variant="outline"
			>
				<Icon data-icon="inline-start" icon={Chat} />
				WhatsApp
			</Button>
			<CommunicationDialog
				channel={channel}
				leadId={leadId}
				onClose={() => setChannel(null)}
			/>
		</>
	);
}

function CommunicationDialog({
	channel,
	leadId,
	onClose,
}: {
	channel: Channel | null;
	leadId: string;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [subject, setSubject] = useState("Following up from Navirex");
	const [body, setBody] = useState("");
	const [emailFiles, setEmailFiles] = useState<EmailAttachmentFile[]>([]);
	const [chosenMode, setMode] = useState<"text" | "template">("text");
	const [templateId, setTemplateId] = useState<string | null>(null);
	const [templateValue, setTemplateValue] =
		useState<WhatsAppTemplateFieldsValue>(templateDefaults(null));
	const status = useQuery({
		...trpc.communications.status.queryOptions(),
		enabled: channel !== null,
	});
	const windowState = useQuery({
		...trpc.communications.whatsappWindow.queryOptions({ leadId }),
		enabled: channel === "whatsapp",
		refetchInterval: WHATSAPP_UI.windowRefreshMs,
	});
	const templates = useQuery({
		...trpc.templates.list.queryOptions(),
		enabled: channel === "whatsapp",
	});
	const whatsappTemplates = (templates.data ?? []).filter(
		(template) =>
			template.active &&
			template.channel === "WHATSAPP" &&
			template.providerTemplateName,
	);
	const template = whatsappTemplates.find((item) => item.id === templateId);

	const windowOpen = windowState.data?.open === true;
	const mode = windowState.data && !windowOpen ? "template" : chosenMode;
	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.activities.timeline.queryKey({ leadId }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.dashboard.leadOverview.queryKey(),
			}),
		]);
	};
	const emailMutation = useMutation(
		trpc.communications.sendEmail.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Email sent.");
				setEmailFiles([]);
				onClose();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const whatsappMutation = useMutation(
		trpc.communications.sendWhatsApp.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("WhatsApp message accepted by Meta.");
				setBody("");
				setTemplateId(null);
				setTemplateValue(templateDefaults(null));
				onClose();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const emailReady = Boolean(
		status.data?.email.google || status.data?.email.microsoft,
	);
	const whatsappReady = status.data?.whatsapp === true;
	const pending = emailMutation.isPending || whatsappMutation.isPending;

	return (
		<Dialog
			open={channel !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{channel === "email" ? "Send email" : "Send WhatsApp message"}
					</DialogTitle>
					<DialogDescription>
						Navirex records the successful send in this lead&apos;s activity.
					</DialogDescription>
				</DialogHeader>
				{status.isPending ? <Spinner /> : null}
				{channel === "email" ? (
					<div className="flex flex-col gap-4">
						<Field label="Subject">
							<Input
								onChange={(event) => setSubject(event.target.value)}
								value={subject}
							/>
						</Field>
						<Field label="Message">
							<Textarea
								className="min-h-40"
								onChange={(event) => setBody(event.target.value)}
								value={body}
							/>
						</Field>
						<EmailAttachmentPicker
							disabled={pending}
							files={emailFiles}
							onChange={setEmailFiles}
						/>
						<Button
							disabled={
								!emailReady || !subject.trim() || !body.trim() || pending
							}
							onClick={() =>
								emailMutation.mutate({
									leadId,
									subject,
									body,
									attachments: emailFiles.map(
										({ size: _size, ...file }) => file,
									),
								})
							}
						>
							{pending
								? "Sending…"
								: emailReady
									? "Send email"
									: "Reconnect email with sending access"}
						</Button>
					</div>
				) : null}
				{channel === "whatsapp" ? (
					<div className="flex flex-col gap-4">
						{windowState.data ? (
							<WhatsAppWindowAlert state={windowState.data} />
						) : null}
						<WhatsAppMediaComposer
							caption={mode === "text" ? body : ""}
							disabled={pending || !whatsappReady || !windowOpen}
							leadId={leadId}
							onSent={() => {
								void refresh();
								setBody("");
							}}
						/>
						<div className="flex gap-2">
							<Button
								disabled={!windowOpen}
								onClick={() => setMode("text")}
								size="sm"
								variant={mode === "text" ? "default" : "outline"}
							>
								Conversation message
							</Button>
							<Button
								onClick={() => setMode("template")}
								size="sm"
								variant={mode === "template" ? "default" : "outline"}
							>
								Approved template
							</Button>
						</div>
						{mode === "text" ? (
							<>
								<Field label="Message">
									<Textarea
										className="min-h-40"
										onChange={(event) => setBody(event.target.value)}
										value={body}
									/>
								</Field>
							</>
						) : (
							<>
								<Field label="Template">
									<Select
										onValueChange={(id) => {
											setTemplateId(id);
											setTemplateValue(
												templateDefaults(
													whatsappTemplates.find((item) => item.id === id)
														?.components ?? null,
												),
											);
										}}
										value={templateId ?? undefined}
									>
										<SelectTrigger>
											<SelectValue
												placeholder={
													whatsappTemplates.length > 0
														? "Choose an approved template"
														: "No approved templates. Sync them in Templates."
												}
											/>
										</SelectTrigger>
										<SelectContent>
											{whatsappTemplates.map((item) => (
												<SelectItem key={item.id} value={item.id}>
													{item.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
								{template ? (
									<WhatsAppTemplatePreview template={template} />
								) : null}
								{template ? (
									<WhatsAppTemplateFields
										components={template.components}
										onChange={setTemplateValue}
										value={templateValue}
									/>
								) : null}
							</>
						)}
						<Button
							disabled={
								!whatsappReady ||
								pending ||
								(mode === "text"
									? !body.trim()
									: !template ||
										!templateReady(template.components, templateValue))
							}
							onClick={() =>
								whatsappMutation.mutate(
									mode === "text"
										? {
												leadId,
												mode,
												body,
												language: "en_US",
												variables: [],
											}
										: {
												leadId,
												mode,
												templateName: template?.providerTemplateName ?? "",
												language: template?.language ?? "en_US",
												variables: [],
												fields: templateValue.fields,
												headerMediaId: templateValue.headerMediaId ?? undefined,
											},
								)
							}
						>
							{pending
								? "Sending…"
								: whatsappReady
									? "Send WhatsApp message"
									: "WhatsApp credentials required"}
						</Button>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 font-medium text-sm">
			<span>{label}</span>
			{children}
		</div>
	);
}
