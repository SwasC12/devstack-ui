import { Directive, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';

// Click-to-sort tables: put `appSort` on a <table>, bind the row array with
// [data], receive the sorted array back via (dataChange), and mark sortable
// columns with <th data-sort="key">. Dotted keys ("createdAtUtc") and mixed
// numbers/strings are handled; nulls always sink to the bottom. The active
// column gets .sort-asc / .sort-desc classes (styled globally).
@Directive({
  selector: 'table[appSort]',
  standalone: true,
})
export class SortableDirective {
  @Input() data: any[] = [];
  @Output() dataChange = new EventEmitter<any[]>();

  private key = '';
  private dir: 1 | -1 = 1;

  constructor(private el: ElementRef<HTMLElement>) {}

  @HostListener('click', ['$event'])
  onClick(e: MouseEvent) {
    const th = (e.target as HTMLElement).closest('th[data-sort]') as HTMLElement | null;
    if (!th || th.classList.contains('no-sort')) return;
    const key = th.dataset['sort'] ?? '';
    if (!key) return;
    if (this.key === key) this.dir = this.dir === 1 ? -1 : 1;
    else { this.key = key; this.dir = 1; }
    this.markHeaders();
    const sorted = [...this.data].sort((a, b) => {
      const va = this.val(a, key);
      const vb = this.val(b, key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * this.dir;
      if (va instanceof Date && vb instanceof Date) return (va.getTime() - vb.getTime()) * this.dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * this.dir;
    });
    this.dataChange.emit(sorted);
  }

  private val(obj: any, key: string): any {
    if (key.includes('.')) return key.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    return obj == null ? null : obj[key];
  }

  private markHeaders() {
    const ths = this.el.nativeElement.querySelectorAll('th[data-sort]');
    ths.forEach((th) => {
      const el = th as HTMLElement;
      el.classList.remove('sort-asc', 'sort-desc');
      if (el.dataset['sort'] === this.key) el.classList.add(this.dir === 1 ? 'sort-asc' : 'sort-desc');
    });
  }
}
