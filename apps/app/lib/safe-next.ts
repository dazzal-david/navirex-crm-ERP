export function safeNext(value: string | string[] | undefined): string | null {
	const next = Array.isArray(value) ? value[0] : value;
	if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
		return null;
	return next;
}
