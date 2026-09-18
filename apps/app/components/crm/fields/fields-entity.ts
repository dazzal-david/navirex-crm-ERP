import type { FieldEntityKind } from "@/components/crm/record-sheet/record-stack";

export type FieldEntity = "COMPANY" | "CONTACT" | "DEAL";

const TO_ENTITY = {
	company: "COMPANY",
	contact: "CONTACT",
	deal: "DEAL",
} satisfies Record<FieldEntityKind, FieldEntity>;

const TO_KIND = {
	COMPANY: "company",
	CONTACT: "contact",
	DEAL: "deal",
} satisfies Record<FieldEntity, FieldEntityKind>;

export function entityOf(kind: FieldEntityKind): FieldEntity {
	return TO_ENTITY[kind];
}

export function kindOf(entity: FieldEntity): FieldEntityKind {
	return TO_KIND[entity];
}
