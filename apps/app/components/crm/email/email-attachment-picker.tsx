"use client";

import AttachmentIcon from "@carbon/icons-react/es/Attachment";
import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useRef } from "react";
import { toast } from "sonner";
import { EMAIL_UI } from "@/lib/communications/email-config";

export type EmailAttachmentFile = {
	name: string;
	mimeType: string;
	contentBase64: string;
	size: number;
};

function readBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = String(reader.result ?? "");
			resolve(result.slice(result.indexOf(",") + 1));
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

function formatSize(bytes: number): string {
	return bytes >= 1024 * 1024
		? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function EmailAttachmentPicker({
	files,
	onChange,
	disabled,
}: {
	files: EmailAttachmentFile[];
	onChange: (files: EmailAttachmentFile[]) => void;
	disabled?: boolean;
}) {
	const input = useRef<HTMLInputElement>(null);

	const add = async (picked: FileList | null) => {
		if (!picked) return;
		const next = [...files];
		for (const file of Array.from(picked)) {
			if (next.length >= EMAIL_UI.attachmentMaxCount) {
				toast.error(`Attach at most ${EMAIL_UI.attachmentMaxCount} files.`);
				break;
			}
			const total = next.reduce((sum, item) => sum + item.size, 0) + file.size;
			if (total > EMAIL_UI.attachmentMaxBytes) {
				toast.error(
					"The attachments are too large. The limit is 3 MB in total.",
				);
				break;
			}
			next.push({
				name: file.name,
				mimeType: file.type || "application/octet-stream",
				contentBase64: await readBase64(file),
				size: file.size,
			});
		}
		onChange(next);
	};

	return (
		<div className="flex flex-wrap items-center gap-2">
			<input
				className="hidden"
				multiple
				onChange={(event) => {
					void add(event.target.files);
					event.target.value = "";
				}}
				ref={input}
				type="file"
			/>
			<Button
				disabled={disabled}
				onClick={() => input.current?.click()}
				size="sm"
				variant="outline"
			>
				<Icon data-icon="inline-start" icon={AttachmentIcon} />
				Attach files
			</Button>
			{files.map((file) => (
				<Button
					key={`${file.name}-${file.size}-${file.contentBase64.length}`}
					onClick={() => onChange(files.filter((item) => item !== file))}
					size="sm"
					variant="ghost"
				>
					{file.name} · {formatSize(file.size)}
					<Icon data-icon="inline-end" icon={Close} />
				</Button>
			))}
		</div>
	);
}
