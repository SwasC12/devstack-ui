// Mirrors the Category entity returned by the DevStack coffee-shop API.
export interface Category {
  id: number;
  name: string;
  station: 'kitchen' | 'bar' | 'both';
  createdAt: string;
}
