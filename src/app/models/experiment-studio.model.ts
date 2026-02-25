export interface BubbleData {
  code: string;
  name: string;
  label?: string;
  type?: string;
  description?: string;
  value: number;
  group?: string;
  children?: BubbleData[];
}

export interface HierarchyData {
  label: string;
  children?: BubbleData[];
  value?: number; // Optional, depending on hierarchy
}
