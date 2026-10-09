"use client";

import Chat from "@carbon/icons-react/es/Chat";
import Email from "@carbon/icons-react/es/Email";
import Notes from "@carbon/icons-react/es/Notebook";
import UserProfile from "@carbon/icons-react/es/UserProfile";
import { Badge } from "@crm/ui/components/badge";
import { Bubble, BubbleContent } from "@crm/ui/components/bubble";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Marker, MarkerContent } from "@crm/ui/components/marker";
import {
	Message,
	MessageContent,
	MessageFooter,
	MessageHeader,
} from "@crm/ui/components/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@crm/ui/components/message-scroller";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	type EmailAttachmentFile,
	EmailAttachmentPicker,
} from "@/components/crm/email/email-attachment-picker";
import { MentionTextarea } from "@/components/crm/mention-textarea";
import {
	contactIdOf,
	defaultRecipient,
	RecipientSelect,
} from "@/components/crm/record-sheet/recipient-select";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { WhatsAppAttachment } from "@/components/crm/whatsapp/whatsapp-attachment";
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
import type { RouterOutputs } from "@/lib/trpc/types";

type Channel = "note" | "email" | "whatsapp";
const EMPTY_TEMPLATE_VALUE: WhatsAppTemplateFieldsValue = {
	fields: {},
	headerMediaId: null,
	headerMediaName: null,
};

export function CommunicationsInbox() {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const queryClient = useQueryClient();
	const conversations = useQuery({
		...trpc.communications.conversations.queryOptions(),
		refetchInterval: 10_000,
		refetchIntervalInBackground: false,
	});
	const status = useQuery(trpc.communications.status.queryOptions());
	const templates = useQuery({
		...trpc.templates.list.queryOptions(),
		refetchInterval: 60_000,
	});
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [to, setTo] = useState<{
		leadId: string;
		channel: "email" | "whatsapp";
		key: string;
	} | null>(null);
	const [query, setQuery] = useState("");
	const [channel, setChannel] = useState<Channel>("note");
	const [subject, setSubject] = useState("Following up from Navirex");
	const [body, setBody] = useState("");
	const [noteMentions, setNoteMentions] = useState<string[]>([]);
	const [emailFiles, setEmailFiles] = useState<EmailAttachmentFile[]>([]);

	const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
		null,
	);
	const [templateValue, setTemplateValue] =
		useState<WhatsAppTemplateFieldsValue>(EMPTY_TEMPLATE_VALUE);
	const leads = conversations.data ?? [];
	const activeId = selectedId ?? leads[0]?.id ?? null;
	const active = leads.find((lead) => lead.id === activeId) ?? null;
	const conversation = useQuery({
		...trpc.communications.conversation.queryOptions({
			leadId: activeId ?? "",
		}),
		enabled: activeId !== null,
		refetchInterval: activeId === null ? false : 3_000,
		refetchIntervalInBackground: false,
	});
	const markRead = useMutation(
		trpc.communications.markRead.mutationOptions({
			onSuccess: () =>
				Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.communications.conversations.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.communications.unread.queryKey(),
					}),
				]),
		}),
	);
	const activeUnread = active?.unread ?? 0;
	const conversationLoaded = conversation.isSuccess;
	const { mutate: markConversationRead, isPending: marking } = markRead;
	useEffect(() => {
		if (!activeId || activeUnread === 0 || !conversationLoaded || marking)
			return;
		markConversationRead({ leadId: activeId });
	}, [
		activeId,
		activeUnread,
		conversationLoaded,
		marking,
		markConversationRead,
	]);
	const visible = leads.filter((lead) =>
		`${lead.name} ${lead.companyName ?? ""} ${lead.email ?? ""}`
			.toLowerCase()
			.includes(query.toLowerCase()),
	);
	const refresh = async () => {
		if (!activeId) return;
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.communications.conversation.queryKey({
					leadId: activeId,
				}),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.communications.conversations.queryKey(),
			}),
		]);
		setBody("");
		setNoteMentions([]);
		setEmailFiles([]);

		setSelectedTemplateId(null);
		setTemplateValue(EMPTY_TEMPLATE_VALUE);
	};
	const note = useMutation(
		trpc.communications.addNote.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const email = useMutation(
		trpc.communications.sendEmail.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const whatsapp = useMutation(
		trpc.communications.sendWhatsApp.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const selectedTemplate = templates.data?.find(
		(template) => template.id === selectedTemplateId,
	);
	const pending = note.isPending || email.isPending || whatsapp.isPending;
	const recipients = conversation.data?.recipients ?? [];
	const recipientChannel = channel === "email" ? "email" : "whatsapp";
	const toKey =
		to && to.leadId === activeId && to.channel === recipientChannel
			? to.key
			: defaultRecipient(recipients, recipientChannel);
	const contactId = contactIdOf(toKey);
	const contactWindow = useQuery({
		...trpc.communications.whatsappWindow.queryOptions({
			leadId: activeId ?? "",
			contactId,
		}),
		enabled: activeId !== null && contactId !== undefined,
		refetchInterval: WHATSAPP_UI.contactWindowRefreshMs,
	});
	const whatsappWindow = contactId
		? (contactWindow.data ?? null)
		: (conversation.data?.whatsappWindow ?? null);
	const usingWhatsAppTemplate = Boolean(selectedTemplate?.providerTemplateName);

	const templatesOnly =
		channel === "whatsapp" &&
		whatsappWindow !== null &&
		!whatsappWindow.open &&
		!usingWhatsAppTemplate;
	const canSend =
		!templatesOnly &&
		Boolean(
			activeId &&
				(body.trim() ||
					(channel === "whatsapp" && selectedTemplate?.providerTemplateName)),
		) &&
		(!usingWhatsAppTemplate ||
			templateReady(selectedTemplate?.components ?? null, templateValue)) &&
		(channel === "note" ||
			(channel === "email" &&
				Boolean(status.data?.email.google || status.data?.email.microsoft)) ||
			(channel === "whatsapp" && status.data?.whatsapp === true));

	return (
		<div className="grid min-h-0 flex-1 overflow-hidden rounded-lg border bg-card md:grid-cols-[18rem_minmax(0,1fr)]">
			<aside className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
				<div className="border-b p-3">
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search leads"
					/>
				</div>
				<div className="max-h-48 overflow-y-auto md:max-h-none md:flex-1">
					{visible.map((lead) => (
						<button
							className="flex w-full flex-col gap-1 border-b px-4 py-3 text-left hover:bg-muted data-[active=true]:bg-muted"
							data-active={lead.id === activeId}
							key={lead.id}
							onClick={() => setSelectedId(lead.id)}
							type="button"
						>
							<span className="flex items-center gap-2">
								<span
									className="truncate font-medium text-sm data-[unread=true]:font-semibold"
									data-unread={lead.unread > 0}
								>
									{lead.name}
								</span>
								{lead.unread > 0 ? (
									<span className="ml-auto">
										<Badge aria-label={`${lead.unread} unread messages`}>
											{lead.unread}
										</Badge>
									</span>
								) : null}
							</span>
							<span className="truncate text-muted-foreground text-xs">
								{lead.preview ??
									lead.companyName ??
									lead.source ??
									"No messages yet"}
							</span>
						</button>
					))}
				</div>
			</aside>
			<section className="flex min-h-0 min-w-0 flex-col">
				{active ? (
					<>
						<header className="flex items-center justify-between gap-4 border-b bg-gradient-to-r from-primary/8 to-transparent px-4 py-3">
							<div className="min-w-0">
								<p className="truncate font-medium">{active.name}</p>
								<p className="truncate text-muted-foreground text-xs">
									{active.companyName ??
										active.email ??
										active.phone ??
										active.stage}
								</p>
							</div>
							<Button
								onClick={() => openRecord({ kind: "lead", id: active.id })}
								size="sm"
								variant="outline"
							>
								<Icon icon={UserProfile} data-icon="inline-start" />
								Open profile
							</Button>
						</header>
						<MessageScrollerProvider autoScroll defaultScrollPosition="end">
							<MessageScroller className="min-h-32 flex-1">
								<MessageScrollerViewport>
									<MessageScrollerContent className="p-4">
										{conversation.data?.items.length ? (
											conversation.data.items.map((item) => (
												<MessageScrollerItem key={item.id}>
													<ConversationBubble
														item={item}
														leadName={active.name}
													/>
												</MessageScrollerItem>
											))
										) : (
											<div className="m-auto text-muted-foreground text-sm">
												Start this conversation with a note or message.
											</div>
										)}
									</MessageScrollerContent>
								</MessageScrollerViewport>
								<MessageScrollerButton />
							</MessageScroller>
						</MessageScrollerProvider>
						<div className="flex min-h-0 shrink flex-col border-t">
							<div className="min-h-0 overflow-y-auto p-3">
								<div className="mb-2 flex flex-wrap gap-2">
									{(["note", "email", "whatsapp"] as const).map((value) => (
										<Button
											key={value}
											size="sm"
											variant={channel === value ? "default" : "outline"}
											onClick={() => {
												setChannel(value);
												setSelectedTemplateId(null);
												setTemplateValue(EMPTY_TEMPLATE_VALUE);
											}}
										>
											<Icon
												icon={
													value === "email"
														? Email
														: value === "whatsapp"
															? Chat
															: Notes
												}
												data-icon="inline-start"
											/>
											{channelLabel(value)}
										</Button>
									))}
									<Select
										onValueChange={(id) => {
											const template = templates.data?.find(
												(item) => item.id === id,
											);
											if (!template) return;
											setSelectedTemplateId(template.id);
											setTemplateValue(templateDefaults(template.components));
											setChannel(template.channel.toLowerCase() as Channel);
											setSubject(
												template.subject ?? "Following up from Navirex",
											);
											setBody(template.body);
										}}
									>
										<SelectTrigger className="ml-auto w-40">
											<SelectValue placeholder="Use template" />
										</SelectTrigger>
										<SelectContent>
											{templates.data
												?.filter((item) => item.active)
												.map((item) => (
													<SelectItem key={item.id} value={item.id}>
														{item.name}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
								</div>
								{channel !== "note" && recipients.length > 1 && activeId ? (
									<div className="mb-2">
										<RecipientSelect
											channel={recipientChannel}
											onChange={(key) =>
												setTo({
													leadId: activeId,
													channel: recipientChannel,
													key,
												})
											}
											recipients={recipients}
											value={toKey}
										/>
									</div>
								) : null}
								{channel === "whatsapp" && whatsappWindow ? (
									<div className="mb-2">
										<WhatsAppWindowAlert state={whatsappWindow} />
									</div>
								) : null}
								{channel === "email" ? (
									<Input
										className="mb-2"
										value={subject}
										onChange={(event) => setSubject(event.target.value)}
										placeholder="Subject"
									/>
								) : null}
								{usingWhatsAppTemplate && selectedTemplate ? (
									<div className="flex flex-col gap-2">
										<WhatsAppTemplatePreview template={selectedTemplate} />
										<WhatsAppTemplateFields
											components={selectedTemplate.components}
											onChange={setTemplateValue}
											value={templateValue}
										/>
									</div>
								) : channel === "note" ? (
									<MentionTextarea
										ariaLabel="Internal note"
										mentions={noteMentions}
										onChange={setBody}
										onMentionsChange={setNoteMentions}
										placeholder="Add an internal note. Type @ to mention a teammate."
										value={body}
									/>
								) : (
									<Textarea
										rows={3}
										value={body}
										onChange={(event) => setBody(event.target.value)}
										disabled={templatesOnly}
										placeholder={
											templatesOnly
												? "Pick an approved template from “Use template” to message this lead."
												: "Write a message…"
										}
									/>
								)}
								{channel === "whatsapp" && activeId ? (
									<div className="mt-2">
										<WhatsAppMediaComposer
											caption={body}
											disabled={
												pending ||
												!status.data?.whatsapp ||
												whatsappWindow?.open !== true
											}
											contactId={contactId}
											leadId={activeId}
											onSent={() => void refresh()}
										/>
									</div>
								) : null}
								{channel === "email" ? (
									<div className="mt-2">
										<EmailAttachmentPicker
											disabled={pending}
											files={emailFiles}
											onChange={setEmailFiles}
										/>
									</div>
								) : null}
							</div>
							<div className="flex shrink-0 items-center justify-between gap-3 border-t px-3 py-2">
								<p className="text-muted-foreground text-xs">
									{composerHint({
										channel,
										templatesOnly,
										canSend,
										sender: status.data?.email.sender ?? null,
									})}
								</p>
								<Button
									disabled={!canSend || pending}
									onClick={() => {
										if (!activeId) return;
										if (channel === "note")
											note.mutate({
												leadId: activeId,
												body,
												mentions: noteMentions,
											});
										if (channel === "email")
											email.mutate({
												leadId: activeId,
												contactId,
												subject,
												body,
												attachments: emailFiles.map(
													({ size: _size, ...file }) => file,
												),
											});
										if (channel === "whatsapp") {
											const providerName =
												selectedTemplate?.providerTemplateName;
											whatsapp.mutate(
												providerName
													? {
															leadId: activeId,
															contactId,
															mode: "template",
															templateName: providerName,
															language: selectedTemplate.language,
															variables: [],
															fields: templateValue.fields,
															headerMediaId:
																templateValue.headerMediaId ?? undefined,
														}
													: {
															leadId: activeId,
															contactId,
															mode: "text",
															body,
															language: "en_US",
															variables: [],
														},
											);
										}
									}}
								>
									Send
								</Button>
							</div>
						</div>
					</>
				) : (
					<div className="m-auto text-muted-foreground text-sm">
						No leads yet.
					</div>
				)}
			</section>
		</div>
	);
}

function channelLabel(channel: Channel): string {
	return channel === "email"
		? "Email"
		: channel === "whatsapp"
			? "WhatsApp"
			: "Note";
}

type ConversationItem = NonNullable<
	RouterOutputs["communications"]["conversation"]
>["items"][number];

function ConversationBubble({
	item,
	leadName,
}: {
	item: ConversationItem;
	leadName: string;
}) {
	return (
		<>
			{item.direction === "internal" ? (
				<Marker variant="separator">
					<MarkerContent>Internal note</MarkerContent>
				</Marker>
			) : null}
			<Message align={item.direction === "outbound" ? "end" : "start"}>
				<MessageContent>
					<MessageHeader>
						{channelLabel(item.channel)}
						{item.subject ? ` · ${item.subject}` : ""}
					</MessageHeader>
					<Bubble
						variant={
							item.direction === "outbound"
								? "tinted"
								: item.direction === "internal"
									? "muted"
									: "outline"
						}
					>
						<BubbleContent className="flex flex-col gap-2 whitespace-pre-wrap">
							{item.attachment ? (
								<WhatsAppAttachment attachment={item.attachment} />
							) : null}
							{item.attachment && /^\[.*\]$/.test(item.body) ? null : item.body}
							{item.fileNames.length > 0 ? (
								<span className="text-muted-foreground text-xs">
									Attached: {item.fileNames.join(", ")}
								</span>
							) : null}
						</BubbleContent>
					</Bubble>
					<MessageFooter>
						{item.authorName ?? leadName}
						{item.direction === "outbound" && item.recipientName
							? ` → ${item.recipientName}`
							: ""}{" "}
						· {new Date(item.occurredAt).toLocaleString()}
						{item.deliveryStatus === "failed"
							? ` · Not delivered${item.deliveryError ? `: ${item.deliveryError}` : ""}`
							: item.deliveryStatus === "read"
								? " · Read"
								: ""}
					</MessageFooter>
				</MessageContent>
			</Message>
		</>
	);
}

function composerHint({
	channel,
	templatesOnly,
	canSend,
	sender,
}: {
	channel: Channel;
	templatesOnly: boolean;
	canSend: boolean;
	sender: string | null;
}): string {
	if (templatesOnly) return "Only templates can be sent to this lead right now";
	if (channel === "note") return "Visible only to your team";
	if (channel === "email" && sender) return `Send from ${sender}`;
	if (channel === "email" && !canSend)
		return "Connect email sending if unavailable";
	if (channel === "whatsapp" && !canSend)
		return "Configure WhatsApp if unavailable";
	return `Send via ${channelLabel(channel)}`;
}
