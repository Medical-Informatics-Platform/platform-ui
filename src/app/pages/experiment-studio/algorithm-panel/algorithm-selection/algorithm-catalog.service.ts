import { Injectable, computed, inject, linkedSignal, signal, untracked } from '@angular/core';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';
import { AlgorithmAvailabilityDetail, AlgorithmConfig } from '../../../../models/algorithm-definition.model';
import { formatAvailabilityMessage } from '../utils/algorithm-availability-text.utils';
import { countAlgorithms, filterAlgorithmCategories, nextCollapsedCategories } from '../utils/algorithm-catalog.utils';
import { AlgorithmCategory } from '../algorithm-panel.models';

/**
 * The method catalog: search text, the Runnable/All filter, which groups are open, and why
 * a method is unavailable. Provided by the algorithm panel.
 */
@Injectable()
export class AlgorithmCatalogService {
  private readonly studio = inject(ExperimentStudioService);

  // The catalog defaults to runnable methods only: each group lists just the available
  // algorithms. Switching to All re-lists unavailable methods with their reason.
  readonly showOnlyActive = signal(true);
  /** Instant text filter over label, name, description, documentation, category, and flags. */
  readonly algoSearchQuery = signal('');
  readonly searchActive = computed(() => this.algoSearchQuery().trim().length > 0);

  readonly filteredAlgorithmCategories = computed(() => filterAlgorithmCategories(
    this.studio.availableGroupedAlgorithms(),
    this.showOnlyActive(),
    this.algoSearchQuery(),
  ));
  readonly hasAnyVisibleAlgorithms = computed(() =>
    this.filteredAlgorithmCategories().some((category) => category.algorithms?.length > 0));
  readonly algoCounts = computed(() => countAlgorithms(this.studio.availableGroupedAlgorithms()));

  /** Groups the user opened or closed themselves; these are never changed automatically. */
  private readonly userToggledCategories = signal<ReadonlySet<string>>(new Set<string>());

  /**
   * Collapsed catalog groups. A group missing from this set is open, so groups coming back
   * after a filter switch keep the state the user left them in. Recomputed from the listed
   * groups and the selection (see nextCollapsedCategories); a toggle sets it directly.
   */
  private readonly collapsedCategories = linkedSignal<
    { categories: AlgorithmCategory[]; selectedName: string | null },
    ReadonlySet<string>
  >({
    source: () => ({
      categories: this.filteredAlgorithmCategories(),
      selectedName: this.studio.selectedAlgorithm()?.name ?? null,
    }),
    computation: (source, previous) => nextCollapsedCategories(
      source.categories,
      source.selectedName,
      previous?.source.selectedName !== source.selectedName,
      previous?.value ?? new Set<string>(),
      untracked(this.userToggledCategories),
    ),
  });

  /** The selected method cannot run with the current roles and datasets. */
  readonly selectedAlgorithmUnavailable = computed(() => {
    const algorithm = this.studio.selectedAlgorithm();
    return !!algorithm && !this.studio.isAlgorithmAvailable(algorithm.name);
  });

  toggleActiveOnly(): void {
    this.showOnlyActive.update((value) => !value);
  }

  clearSearch(): void {
    this.algoSearchQuery.set('');
  }

  isCategoryOpen(categoryName: string): boolean {
    return !this.collapsedCategories().has(categoryName);
  }

  toggleCategory(categoryName: string): void {
    this.userToggledCategories.update((toggled) => new Set(toggled).add(categoryName));
    const next = new Set(this.collapsedCategories());
    if (!next.delete(categoryName)) next.add(categoryName);
    this.collapsedCategories.set(next);
  }

  /** The role checks behind a method's availability: its own, else the studio's. */
  availabilityDetails(algorithm: AlgorithmConfig | null): AlgorithmAvailabilityDetail[] {
    if (!algorithm) return [];
    if (algorithm.availability?.details?.length) return algorithm.availability.details;
    return this.studio.getAlgorithmAvailability(algorithm.name).details ?? [];
  }

  /** The one-line reason on an unavailable method's tile. */
  algorithmUnavailableReason(algorithm: AlgorithmConfig): string {
    const availability = this.studio.getAlgorithmAvailability(algorithm.name);
    const summary = availability?.summary || algorithm.availability?.summary || '';
    if (summary) return formatAvailabilityMessage(summary);
    const details = availability?.details?.length
      ? availability.details
      : (algorithm.availability?.details ?? []);
    const first = details.find((detail) => detail.messages.length > 0);
    return first ? formatAvailabilityMessage(first.messages[0]) : 'Unavailable';
  }
}
