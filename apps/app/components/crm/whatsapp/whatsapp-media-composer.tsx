"use client";

import AttachmentIcon from "@carbon/icons-react/es/Attachment";
import Microphone from "@carbon/icons-react/es/Microphone";
import StopFilledAlt from "@carbon/icons-react/es/StopFilledAlt";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { toMp3 } from "@/lib/communications/mp3";
import { WHATSAPP_UI } from "@/lib/communications/whatsapp-config";

type Draft = { file: Blob; filename: string; previewUrl: string };

const errorBody = z.object({
	message: z.union([z.string(), z.array(z.string())]),
});

export async function sendWhatsAppFile(
	leadId: string,
	file: Blob,
	filename: string,
	caption?: string,
): Promise<void> {
	const params = new URLSearchParams({ filename });
	if (caption?.trim()) params.set("caption", caption.trim());
	const response = await fetch(
		`/api/communications/whatsapp/${encodeURIComponent(leadId)}/media?${params}`,
		{
			method: "POST",
			headers: { "content-type": file.type || "application/octet-stream" },
			body: file,
		},
	);
	if (response.ok) return;
	const parsed = errorBody.safeParse(await response.json().catch(() => null));
	const message = parsed.success
		? [parsed.data.message].flat().join(" ")
		: response.status === 413
			? "The file is too large. The limit is 4 MB."
			: `WhatsApp returned HTTP ${response.status}.`;
	throw new Error(message);
}

export function WhatsAppMediaComposer({
	leadId,
	caption,
	disabled,
	onSent,
}: {
	leadId: string;
	caption: string;
	disabled: boolean;
	onSent: () => void;
}) {
	const fileInput = useRef<HTMLInputElement>(null);
	const recorder = useRef<MediaRecorder | null>(null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [recording, setRecording] = useState(false);
	const [seconds, setSeconds] = useState(0);
	const [sending, setSending] = useState(false);

	useEffect(() => {
		if (!recording) return;
		const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
		return () => clearInterval(timer);
	}, [recording]);

	useEffect(
		() => () => {
			if (draft) URL.revokeObjectURL(draft.previewUrl);
		},
		[draft],
	);

	useEffect(
		() => () => {
			recorder.current?.stream.getTracks().forEach((track) => {
				track.stop();
			});
		},
		[],
	);

	const pick = (file: File | undefined) => {
		if (!file) return;
		if (file.size > WHATSAPP_UI.uploadMaxBytes) {
			toast.error("The file is too large. The limit is 4 MB.");
			return;
		}
		setDraft({
			file,
			filename: file.name,
			previewUrl: URL.createObjectURL(file),
		});
	};

	const startRecording = async () => {
		const format = !("MediaRecorder" in globalThis)
			? undefined
			: WHATSAPP_UI.recordingTypes.find((type) =>
					MediaRecorder.isTypeSupported(type),
				);
		if (!format) {
			toast.error(
				"This browser cannot record audio. Use the latest Chrome, Safari or Firefox.",
			);
			return;
		}
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			toast.error("Allow microphone access to record a voice note.");
			return;
		}
		const chunks: Blob[] = [];
		const media = new MediaRecorder(stream, { mimeType: format });
		media.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		media.onstop = async () => {
			stream.getTracks().forEach((track) => {
				track.stop();
			});
			let file: Blob;
			try {
				file = await toMp3(new Blob(chunks, { type: format }));
			} catch {
				toast.error(
					"The voice note could not be converted. Try recording again.",
				);
				return;
			}
			if (file.size > WHATSAPP_UI.uploadMaxBytes) {
				toast.error("The voice note is too long. The limit is 4 MB.");
				return;
			}
			setDraft({
				file,
				filename: WHATSAPP_UI.voiceNote.filename,
				previewUrl: URL.createObjectURL(file),
			});
		};
		recorder.current = media;
		setSeconds(0);
		setRecording(true);
		media.start();
	};

	const stopRecording = () => {
		recorder.current?.stop();
		recorder.current = null;
		setRecording(false);
	};

	const send = async () => {
		if (!draft) return;
		setSending(true);
		try {
			await sendWhatsAppFile(
				leadId,
				draft.file,
				draft.filename,
				draft.file.type.startsWith("audio/") ? undefined : caption,
			);
			toast.success("File sent on WhatsApp.");
			setDraft(null);
			onSent();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setSending(false);
		}
	};

	if (draft) {
		const isImage = draft.file.type.startsWith("image/");
		const isAudio = draft.file.type.startsWith("audio/");
		return (
			<div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
				{isImage ? (
					<img
						alt={draft.filename}
						className="size-12 rounded-sm object-cover"
						src={draft.previewUrl}
					/>
				) : null}
				{isAudio ? (
					<audio controls src={draft.previewUrl}>
						<track kind="captions" />
					</audio>
				) : null}
				<span className="min-w-0 flex-1 truncate text-sm">
					{draft.filename}
					{caption.trim() && !isAudio
						? " · the message text is the caption"
						: ""}
				</span>
				<Button
					disabled={sending}
					onClick={() => setDraft(null)}
					size="sm"
					variant="outline"
				>
					<Icon data-icon="inline-start" icon={TrashCan} />
					Discard
				</Button>
				<Button disabled={sending || disabled} onClick={send} size="sm">
					{sending ? <Spinner data-icon="inline-start" /> : null}
					Send file
				</Button>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<input
				accept={WHATSAPP_UI.accept}
				className="hidden"
				onChange={(event) => {
					pick(event.target.files?.[0]);
					event.target.value = "";
				}}
				ref={fileInput}
				type="file"
			/>
			<Button
				disabled={disabled || recording}
				onClick={() => fileInput.current?.click()}
				size="sm"
				variant="outline"
			>
				<Icon data-icon="inline-start" icon={AttachmentIcon} />
				Attach
			</Button>
			{recording ? (
				<Button onClick={stopRecording} size="sm" variant="destructive">
					<Icon data-icon="inline-start" icon={StopFilledAlt} />
					Stop · {Math.floor(seconds / 60)}:
					{String(seconds % 60).padStart(2, "0")}
				</Button>
			) : (
				<Button
					disabled={disabled}
					onClick={startRecording}
					size="sm"
					variant="outline"
				>
					<Icon data-icon="inline-start" icon={Microphone} />
					Voice note
				</Button>
			)}
		</div>
	);
}
