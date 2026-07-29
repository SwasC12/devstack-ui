import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Tool } from './tool.model';
import { ToolService } from './tool.service';

type LoadState = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private toolService = inject(ToolService);

  // Signals hold reactive state; the template re-renders automatically on change.
  readonly state = signal<LoadState>('loading');
  readonly tools = signal<Tool[]>([]);
  readonly errorMessage = signal<string>('');

  // Derived values recompute automatically from `tools`.
  readonly total = computed(() => this.tools().length);
  readonly paidCount = computed(() => this.tools().filter((t) => t.isPaid).length);
  readonly monthlySpend = computed(() =>
    this.tools().reduce((sum, t) => sum + (t.monthlyCost ?? 0), 0)
  );

  // Placeholder array so the template can render shimmering skeleton cards.
  readonly skeletons = Array.from({ length: 6 });

  // Inline add-form state
  readonly showForm = signal(false);
  readonly formName = signal('');
  readonly formCategory = signal('');
  readonly formIsPaid = signal(false);
  readonly formMonthlyCost = signal<number | null>(null);
  readonly formUrl = signal('');
  readonly formNotes = signal('');
  readonly formProjects = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.toolService.getTools().subscribe({
      next: (tools) => {
        this.tools.set(tools);
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

  submitTool(): void {
    const tool: Partial<Tool> = {
      name: this.formName(),
      category: this.formCategory(),
      isPaid: this.formIsPaid(),
      monthlyCost: this.formIsPaid() ? this.formMonthlyCost() : null,
      url: this.formUrl() || null,
      notes: this.formNotes() || null,
      projects: this.formProjects() || null,
    };

    this.toolService.createTool(tool).subscribe({
      next: (created) => {
        this.tools.update((list) => [...list, created]);
        this.resetForm();
        this.showForm.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.message ?? 'Failed to add tool.');
      },
    });
  }

  deleteTool(id: number): void {
    if (!confirm('Remove this tool?')) return;
    this.toolService.deleteTool(id).subscribe({
      next: () => {
        this.tools.update((list) => list.filter((t) => t.id !== id));
      },
      error: (err) => {
        this.errorMessage.set(err?.message ?? 'Failed to delete tool.');
        this.state.set('error');
      },
    });
  }

  resetForm(): void {
    this.formName.set('');
    this.formCategory.set('');
    this.formIsPaid.set(false);
    this.formMonthlyCost.set(null);
    this.formUrl.set('');
    this.formNotes.set('');
    this.formProjects.set('');
  }

  // Splits the comma-separated projects string into trimmed tags.
  projectTags(tool: Tool): string[] {
    return (tool.projects ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
}
