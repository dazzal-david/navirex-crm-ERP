"use client";

import AttachmentIcon from "@carbon/icons-react/es/Attachment";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import {
	templateFields,
	templateHeaderMedia,
	unsupportedTemplateReason,
	type WhatsAppTemplateComponent,
} from "@crm/validation/whatsapp-template";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { WHATSAPP_UI } from "@/lib/communications/whatsapp-config";

const uploadResult = z.object({ id: z.string() });
const errorBody = z.object({
	message: z.union([z.string(), z.array(z.string())]),
});

export type WhatsAppTemplateFieldsValue = {
	fields: Record<string, string>;
	headerMediaId: string | null;
	headerMediaName: string | null;
};

export function templateDefaults(
	components: WhatsAppTemplateComponent[] | null,
): WhatsAppTemplateFieldsValue {
	return {
		fields: Object.fromEntries(
			templateFields(components ?? []).map((field) => [
				field.key,
				field.example,
			]),
		),
		headerMediaId: null,
		headerMediaName: null,
	};
}

export function templateReady(
	components: WhatsAppTemplateComponent[] | null,
	value: WhatsAppTemplateFieldsValue,
): boolean {
	const list = components ?? [];
	if (unsupportedTemplateReason(list)) return false;
	const media = templateHeaderMedia(list);
	if (media && !media.sampleUrl && !value.headerMediaId) return false;
	return templateFields(list).every((field) =>
		Boolean(value.fields[field.key]?.trim()),
	);
}

async function uploadHeader(file: File): Promise<string> {
	const response = await fetch(
		`/api/communications/whatsapp/upload?${new URLSearchParams({ filename: file.name })}`,
		{
			method: "POST",
			headers: { "content-type": file.type || "application/octet-stream" },
			body: file,
		},
	);
	const body = await response.json().catch(() => null);
	const uploaded = uploadResult.safeParse(body);
	if (response.ok && uploaded.success) return uploaded.data.id;
	const failure = errorBody.safeParse(body);
	throw new Error(
		failure.success
			? [failure.data.message].flat().join(" ")
			: `WhatsApp returned HTTP ${response.status}.`,
	);
}

export function WhatsAppTemplateFields({
	components,
	value,
	onChange,
}: {
	components: WhatsAppTemplateComponent[] | null;
	value: WhatsAppTemplateFieldsValue;
	onChange: (value: WhatsAppTemplateFieldsValue) => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const list = components ?? [];
	const reason = unsupportedTemplateReason(list);
	const media = templateHeaderMedia(list);
	const fields = templateFields(list);

	if (reason) {
		return <p className="text-destructive text-sm">{reason}</p>;
	}

	const replace = async (file: File | undefined) => {
		if (!file) return;
		if (file.size > WHATSAPP_UI.uploadMaxBytes) {
			toast.error("The file is too large. The limit is 4 MB.");
			return;
		}
		setUploading(true);
		try {
			const id = await uploadHeader(file);
			onChange({ ...value, headerMediaId: id, headerMediaName: file.name });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			{media ? (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">
						Header {media.kind}:{" "}
						{value.headerMediaName ??
							(media.sampleUrl ? "the approved one" : "none on file")}
					</span>
					<input
						accept={
							media.kind === "image"
								? "image/jpeg,image/png"
								: media.kind === "video"
									? "video/mp4"
									: "application/pdf"
						}
						className="hidden"
						onChange={(event) => {
							void replace(event.target.files?.[0]);
							event.target.value = "";
						}}
						ref={input}
						type="file"
					/>
					<Button
						disabled={uploading}
						onClick={() => input.current?.click()}
						size="sm"
						variant="outline"
					>
						{uploading ? (
							<Spinner data-icon="inline-start" />
						) : (
							<Icon data-icon="inline-start" icon={AttachmentIcon} />
						)}
						Replace {media.kind}
					</Button>
					{value.headerMediaId ? (
						<Button
							onClick={() =>
								onChange({
									...value,
									headerMediaId: null,
									headerMediaName: null,
								})
							}
							size="sm"
							variant="ghost"
						>
							Use the approved {media.kind}
						</Button>
					) : null}
				</div>
			) : null}
			{fields.map((field) => (
				<Input
					aria-label={field.label}
					key={field.key}
					onChange={(event) =>
						onChange({
							...value,
							fields: { ...value.fields, [field.key]: event.target.value },
						})
					}
					placeholder={field.label}
					value={value.fields[field.key] ?? ""}
				/>
			))}
		</div>
	);
}
