# Metadata Browser

The metadata browser is an alternative to the bubble chart for exploring a pathology
`CDEsMetadata.json` hierarchy in Experiment Studio.

## Normalized metadata model

`metadata-browser-normalizer.ts` converts the existing `D3HierarchyNode` tree into
a normalized index with stable group and variable IDs, parent links, child group
lists, direct variable lists, breadcrumb labels, direct counts, and total variable
counts. Variables keep their original `D3HierarchyNode` reference so existing
selection, histogram, and parameter-list flows continue to receive the same node
shape as the bubble chart.

## Hierarchy navigation model

The browser currently supports three modes:

- **Tree**: BioPortal-style ontology browser with a keyboard-accessible group
  tree and immediate group contents. This is the default and the best fit for
  clinical metadata review because it keeps navigation explicit and uses the
  shared Experiment Studio search bar.
- **Collapsible**: D3 node-link hierarchy visualization for interactive visual
  traversal. It is best when users want to see how branches unfold from the
  selected data model while keeping variable labels readable.
- **Bubble**: The existing D3 bubble chart overview.

## Mixed-node support

Groups may contain both child groups and direct variables. The normalized model
stores these separately, and the Tree browser shows mixed nodes without assuming
variables only appear at leaf groups.

## Search behavior

The shared Experiment Studio search bar is shown above every visualization mode.
It searches variables and groups, then emits the original node to the active
visualization and Variables panel. Tree and Collapsible expand to the selected
path; Bubble keeps its zoom/highlight behavior.
