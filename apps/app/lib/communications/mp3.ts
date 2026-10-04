import { WHATSAPP_UI } from "./whatsapp-config";

export async function toMp3(recording: Blob): Promise<Blob> {
	const { Mp3Encoder } = await import("@breezystack/lamejs");
	const context = new AudioContext();
	let audio: AudioBuffer;
	try {
		audio = await context.decodeAudioData(await recording.arrayBuffer());
	} finally {
		await context.close();
	}

	const source = audio.getChannelData(0);
	const samples = new Int16Array(source.length);
	for (let index = 0; index < source.length; index += 1) {
		const value = Math.max(-1, Math.min(1, source[index] ?? 0));
		samples[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
	}

	const { kbps, frameSamples } = WHATSAPP_UI.voiceNote;
	const encoder = new Mp3Encoder(1, audio.sampleRate, kbps);
	const parts: Uint8Array<ArrayBuffer>[] = [];
	for (let start = 0; start < samples.length; start += frameSamples) {
		const frame = encoder.encodeBuffer(
			samples.subarray(start, start + frameSamples),
		);
		if (frame.length > 0) parts.push(new Uint8Array(frame));
	}
	const tail = encoder.flush();
	if (tail.length > 0) parts.push(new Uint8Array(tail));

	return new Blob(parts, { type: "audio/mpeg" });
}
