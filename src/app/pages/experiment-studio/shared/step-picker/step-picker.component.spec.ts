import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StepPickerGroup } from '../../../../core/step-picker.utils';
import { StepPickerComponent } from './step-picker.component';

const GROUPS: StepPickerGroup[] = [
  {
    key: 'reshape',
    label: 'Reshape and scale',
    options: [
      { id: 'variable_transformer', icon: 'fas fa-arrow-up-right-dots', title: 'Variable Transforms', subtitle: 'Reshape skewed values.' },
      { id: 'variable_scaler', icon: 'fas fa-ruler-horizontal', title: 'Variable Scaling', subtitle: 'Bring variables to a comparable range.' },
    ],
  },
  {
    key: 'encode',
    label: 'Encode categories',
    options: [
      { id: 'one_hot_encoder', icon: 'fas fa-table-columns', title: 'One-Hot Encoder', subtitle: 'Create 0/1 dummy columns.' },
    ],
  },
];

@Component({
  imports: [StepPickerComponent],
  template: `
    <app-step-picker
      label="Add a transformation step"
      hint="Reshape values, encode categories, flag records or create columns."
      [groups]="groups()"
      [open]="startOpen()"
      (pick)="picked.push($event)"></app-step-picker>
  `,
})
class HostComponent {
  readonly groups = signal<StepPickerGroup[]>(GROUPS);
  readonly startOpen = signal(false);
  readonly picked: string[] = [];
}

describe('StepPickerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;

  const trigger = () => el.querySelector('.step-picker-trigger') as HTMLButtonElement | null;
  const options = () => Array.from(el.querySelectorAll('.step-picker-option')) as HTMLButtonElement[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows one closed add row that says what it adds', () => {
    expect(trigger()).not.toBeNull();
    expect(trigger()!.getAttribute('type')).toBe('button');
    expect(trigger()!.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.step-picker-label')?.textContent?.trim()).toBe('Add a transformation step');
    expect(el.querySelector('.step-picker-hint')?.textContent?.trim())
      .toBe('Reshape values, encode categories, flag records or create columns.');
    // Closed, the steps themselves are not on screen: that is the whole point of the row.
    expect(el.querySelector('.step-picker-menu')).toBeNull();
    expect(options()).toEqual([]);
    expect(el.querySelector('.step-picker')?.classList.contains('is-open')).toBe(false);
  });

  it('opens the menu from the add row, one labelled group per purpose', () => {
    trigger()!.click();
    fixture.detectChanges();

    expect(trigger()!.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.step-picker')?.classList.contains('is-open')).toBe(true);
    const groups = Array.from(el.querySelectorAll('.step-picker-group')) as HTMLElement[];
    expect(groups.map((group) => group.dataset['group'])).toEqual(['reshape', 'encode']);
    expect(groups.map((group) => group.querySelector('.step-picker-group-label')?.textContent?.trim()))
      .toEqual(['Reshape and scale', 'Encode categories']);
    expect(groups.map((group) => group.querySelectorAll('.step-picker-option').length)).toEqual([2, 1]);
  });

  it('shows each step with its icon, name and full description', () => {
    trigger()!.click();
    fixture.detectChanges();

    expect(options().map((option) => option.dataset['step']))
      .toEqual(['variable_transformer', 'variable_scaler', 'one_hot_encoder']);
    const encoder = options()[2];
    expect(encoder.getAttribute('type')).toBe('button');
    expect(encoder.querySelector('i')?.className).toContain('fa-table-columns');
    expect(encoder.querySelector('.step-picker-option-title')?.textContent?.trim()).toBe('One-Hot Encoder');
    expect(encoder.querySelector('.step-picker-option-subtitle')?.textContent?.trim()).toBe('Create 0/1 dummy columns.');
  });

  it('reports the picked step once and closes the menu', () => {
    trigger()!.click();
    fixture.detectChanges();

    options()[1].click();
    fixture.detectChanges();

    expect(host.picked).toEqual(['variable_scaler']);
    expect(trigger()!.getAttribute('aria-expanded')).toBe('false');
    expect(options()).toEqual([]);
  });

  it('starts open when the parent asks for it, and still folds from the add row', () => {
    host.startOpen.set(true);
    fixture.detectChanges();

    expect(trigger()!.getAttribute('aria-expanded')).toBe('true');
    expect(options().length).toBe(3);

    trigger()!.click();
    fixture.detectChanges();

    expect(trigger()!.getAttribute('aria-expanded')).toBe('false');
    expect(options()).toEqual([]);
  });

  it('closes on Escape without picking anything', () => {
    trigger()!.click();
    fixture.detectChanges();

    options()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(trigger()!.getAttribute('aria-expanded')).toBe('false');
    expect(host.picked).toEqual([]);
  });

  it('leaves the hint line out when there is no hint', () => {
    const bare = TestBed.createComponent(StepPickerComponent);
    bare.componentRef.setInput('groups', GROUPS);
    bare.detectChanges();

    expect((bare.nativeElement as HTMLElement).querySelector('.step-picker-label')?.textContent?.trim()).toBe('Add a step');
    expect((bare.nativeElement as HTMLElement).querySelector('.step-picker-hint')).toBeNull();
  });

  it('renders nothing when there is no step left to add', () => {
    host.groups.set([]);
    fixture.detectChanges();

    expect(el.querySelector('.step-picker')).toBeNull();
    expect(trigger()).toBeNull();
  });
});
