export function templateVariablePositions(body: string): number[] {
	return [
		...new Set(
			Array.from(body.matchAll(/{{\s*(\d+)\s*}}/g), (match) =>
				Number(match[1] ?? 0),
			),
		),
	].sort((left, right) => left - right);
}
