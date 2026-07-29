import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuItem } from './menu-item.model';
import { MenuItemService } from './menu-item.service';
import { DisplayCardComponent } from './display-card/display-card.component';

type LoadState = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DisplayCardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private menuService = inject(MenuItemService);

  // Signals hold reactive state; the template re-renders automatically on change.
  readonly state = signal<LoadState>('loading');
  readonly items = signal<MenuItem[]>([]);
  readonly errorMessage = signal<string>('');

  // Derived values recompute automatically from `items`.
  readonly total = computed(() => this.items().length);
  readonly availableCount = computed(
    () => this.items().filter((i) => i.isAvailable).length
  );
  readonly categoryCount = computed(
    () => new Set(this.items().map((i) => i.category)).size
  );

  // Placeholder array so the template can render shimmering skeleton cards.
  readonly skeletons = Array.from({ length: 8 });

  // Inline add-form state
  readonly showForm = signal(false);
  readonly formName = signal('');
  readonly formCategory = signal('');
  readonly formPrice = signal<number | null>(null);
  readonly formDescription = signal('');
  readonly formAvailable = signal(true);
  readonly formImageUrl = signal('');
  readonly formImagePublicId = signal('');
  readonly uploading = signal(false);
  readonly saving = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.menuService.getItems().subscribe({
      next: (items) => {
        this.items.set(items);
        this.state.set('loaded');
      },
      error: (err) => {
        this.errorMessage.set(err?.message ?? 'Could not reach the API.');
        this.state.set('error');
      },
    });
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
  }

  // Called when a file is chosen in the add-form; uploads to Cloudinary and
  // stashes the returned URL so it's submitted with the rest of the item.
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading.set(true);
    this.menuService.uploadImage(file).subscribe({
      next: ({ url, publicId }) => {
        this.formImageUrl.set(url);
        this.formImagePublicId.set(publicId);
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);
        this.errorMessage.set(err?.message ?? 'Image upload failed.');
      },
    });
  }

  submitItem(): void {
    const item: Partial<MenuItem> = {
      name: this.formName(),
      category: this.formCategory(),
      price: this.formPrice() ?? 0,
      description: this.formDescription() || null,
      imageUrl: this.formImageUrl() || null,
      imagePublicId: this.formImagePublicId() || null,
      isAvailable: this.formAvailable(),
    };

    this.saving.set(true);
    this.menuService.writeItem(item).subscribe({
      next: (saved) => {
        this.items.update((list) => [...list, saved]);
        this.resetForm();
        this.showForm.set(false);
        this.saving.set(false);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.message ?? 'Failed to save item.');
      },
    });
  }

  deleteItem(id: number): void {
    if (!confirm('Remove this item from the menu?')) return;
    this.menuService.deleteItem(id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((i) => i.id !== id));
      },
      error: (err) => {
        this.errorMessage.set(err?.message ?? 'Failed to delete item.');
        this.state.set('error');
      },
    });
  }

  resetForm(): void {
    this.formName.set('');
    this.formCategory.set('');
    this.formPrice.set(null);
    this.formDescription.set('');
    this.formAvailable.set(true);
    this.formImageUrl.set('');
    this.formImagePublicId.set('');
  }
}
