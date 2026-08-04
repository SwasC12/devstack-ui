// Mirrors the MenuItem entity returned by the DevStack coffee-shop API.
export interface MenuSize {
  id: number;
  name: string;
  price: number;
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
  createdAt: string;
  sizes?: MenuSize[];
}
