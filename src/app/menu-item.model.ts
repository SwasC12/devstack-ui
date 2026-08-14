// Mirrors the MenuItem entity returned by the DevStack coffee-shop API.
export interface MenuSize {
  id: number;
  name: string;
  price: number;
}

export interface Modifier {
  id: number;
  name: string;
  priceDelta: number;
}

export interface ModifierGroup {
  id: number;
  name: string;
  isMulti: boolean;
  modifiers: Modifier[];
}

export interface RecipeLine {
  id: number;
  name: string;
  costPerUnit: number;
  quantity: number;
}

export interface MenuItem {
  id: number;
  name: string;
  category: string;
  price: number;
  description?: string | null;
  imageUrl?: string | null;
  imagePublicId?: string | null;
  isAvailable: boolean;
  stockQuantity: number;
  lowStockThreshold?: number;
  createdAt: string;
  sizes?: MenuSize[];
  modifierGroups?: ModifierGroup[];
  recipeLines?: RecipeLine[];
  costBasis?: number;
}
