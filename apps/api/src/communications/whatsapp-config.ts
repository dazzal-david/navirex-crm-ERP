import { META } from "../meta/meta-config";

const HOUR_MS = 60 * 60 * 1000;
const MB = 1024 * 1024;

export const WHATSAPP = {
	graphBase: META.graphBase,
	timeoutMs: 20_000,
	serviceWindowMs: 24 * HOUR_MS,
	uploadMaxBytes: 4 * MB,
	templateHeaderMaxBytes: 16 * MB,
	templateHeaderTypes: {
		image: "image/jpeg",
		video: "video/mp4",
		document: "application/pdf",
	},
	windowClosedCodes: [131047],
	webhookFields: ["messages", "smb_message_echoes"],
	conversationLimit: 250,
	noteLimit: 500,
	mediaKinds: {
		image: ["image/jpeg", "image/png"],
		video: ["video/mp4", "video/3gpp"],
		audio: ["audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/amr"],
		document: [
			"application/pdf",
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.ms-excel",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-powerpoint",
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			"text/plain",
		],
	},
} as const;

export type WhatsAppMediaKind = keyof typeof WHATSAPP.mediaKinds;

export const WINDOW_CLOSED_MESSAGE =
	"Only approved templates can be sent. This lead has not messaged you in the last 24 hours.";
