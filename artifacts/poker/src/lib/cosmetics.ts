// Catalog of cosmetic items players can buy in the shop.
// Each item has a stable id, a category, a price (chips), and a label.
// "Owning" an item adds its id to account.inventory; "equipping" stores it
// under the matching key in account.equipped.

export type CosmeticKind = "cardBack" | "nameColor" | "title";

export interface CosmeticItem {
  id: string;
  kind: CosmeticKind;
  label: string;
  price: number;
  // For nameColor items, the actual CSS color value.
  color?: string;
  // Whether all accounts implicitly own this item (defaults).
  free?: boolean;
}

export const CARD_BACKS: CosmeticItem[] = [
  { id: "classic", kind: "cardBack", label: "Classic Blue", price: 0, free: true },
  { id: "ruby", kind: "cardBack", label: "Ruby Diamond", price: 250 },
  { id: "stars", kind: "cardBack", label: "Forest Stars", price: 400 },
  { id: "checker", kind: "cardBack", label: "Casino Red", price: 600 },
  { id: "felt", kind: "cardBack", label: "Felt Spotlight", price: 1000 },
];

export const NAME_COLORS: CosmeticItem[] = [
  { id: "white", kind: "nameColor", label: "White", price: 0, color: "#ffffff", free: true },
  { id: "amber", kind: "nameColor", label: "Amber", price: 100, color: "#ffcc00" },
  { id: "rose", kind: "nameColor", label: "Rose", price: 150, color: "#ff79b0" },
  { id: "cyan", kind: "nameColor", label: "Cyan", price: 200, color: "#34d6ff" },
  { id: "lime", kind: "nameColor", label: "Lime", price: 250, color: "#9bff7d" },
  { id: "violet", kind: "nameColor", label: "Violet", price: 350, color: "#c79bff" },
];

export const TITLES: CosmeticItem[] = [
  { id: "none", kind: "title", label: "(no title)", price: 0, free: true },
  { id: "rookie", kind: "title", label: "Rookie", price: 50 },
  { id: "sharp", kind: "title", label: "Sharp", price: 200 },
  { id: "bluffer", kind: "title", label: "Bluffer", price: 400 },
  { id: "whale", kind: "title", label: "Whale", price: 1000 },
  { id: "feltmaster", kind: "title", label: "Felt Master", price: 5000 },
];

export const ALL_ITEMS: CosmeticItem[] = [
  ...CARD_BACKS,
  ...NAME_COLORS,
  ...TITLES,
];

export function findItem(id: string): CosmeticItem | undefined {
  return ALL_ITEMS.find((i) => i.id === id);
}

export function isOwned(item: CosmeticItem, inventory: string[]): boolean {
  return item.free === true || inventory.includes(item.id);
}

export function nameColorValue(equipped: { nameColor?: string } | null): string {
  if (!equipped?.nameColor) return "#ffffff";
  const item = NAME_COLORS.find((c) => c.id === equipped.nameColor);
  return item?.color ?? "#ffffff";
}

export function titleLabel(equipped: { title?: string } | null): string | null {
  if (!equipped?.title || equipped.title === "none") return null;
  const item = TITLES.find((t) => t.id === equipped.title);
  if (!item) return null;
  return item.label;
}

export function cardBackId(equipped: { cardBack?: string } | null): string {
  return equipped?.cardBack ?? "classic";
}
