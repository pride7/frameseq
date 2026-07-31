/**
 * The one description of how the documentation is organised. The Gallery sidebar and
 * the documentation home page are both generated or checked against it, so a page
 * cannot exist without a place in the navigation, and the two cannot disagree.
 *
 * The order is a reading order: what to do first, then how to write slides, then the
 * specialised subjects, and only then the reference.
 */
export const documentationGroups = [
  {
    label: "Start",
    summary: "Install FrameSeq, write a first talk, and revise it.",
    pages: [
      {
        slug: "index",
        source: "docs/README.md",
        label: "Documentation home",
        blurb: "What to read, in the order that gets a talk written.",
      },
      {
        slug: "getting-started",
        source: "docs/getting-started.md",
        label: "Getting started",
        blurb: "Create a project, write the first slides, preview them, and export the result.",
      },
      {
        slug: "recipes",
        source: "docs/recipes.md",
        label: "Recipes",
        previews: "recipes",
        blurb: "A complete slide for each page a talk needs, with the result beside it.",
      },
      {
        slug: "revising",
        source: "docs/revising.md",
        label: "Revising a talk",
        blurb: "The edits a second draft needs, each as a diff and measured in lines.",
      },
    ],
  },
  {
    label: "Write slides",
    summary: "The model behind the recipes, one subject at a time.",
    pages: [
      {
        slug: "document-model",
        source: "docs/document-model.md",
        label: "Document model",
        blurb: "How presentation(), slide(), objects, and the active region fit together.",
      },
      {
        slug: "content",
        source: "docs/content.md",
        label: "Content",
        blurb: "Text, lists, images, code, formulas, metrics, cards, and groups.",
      },
      {
        slug: "layout",
        source: "docs/layout.md",
        label: "Layout",
        blurb: "Normal flow, split pages, grids, local grids, region paths, and canvas.",
      },
      {
        slug: "diagrams",
        source: "docs/diagrams.md",
        label: "Diagrams",
        blurb: "Region paths, automatic rows and columns, names, and connectors that follow their objects.",
      },
      {
        slug: "shapes",
        source: "docs/shapes.md",
        label: "Shapes and connectors",
        blurb: "The primitives a diagram is built from: rectangles, circles, lines, and arrows.",
      },
      {
        slug: "styling",
        source: "docs/styling.md",
        label: "Styling",
        blurb: "Chainable modifiers, text roles, dimensions, Tailwind utilities, and inline styles.",
      },
      {
        slug: "themes",
        source: "docs/themes.md",
        label: "Themes",
        blurb: "Built-in themes, presentation-wide typography, CJK text, and custom tokens.",
      },
    ],
  },
  {
    label: "Typeset mathematics and tables",
    summary: "Bring an external typesetter in for the fragments that need one.",
    pages: [
      {
        slug: "typst",
        source: "docs/typst.md",
        label: "Typst integration",
        blurb: "Embed Typst fragments, or export the whole presentation as editable .typ source.",
      },
      {
        slug: "latex",
        source: "docs/latex.md",
        label: "LaTeX integration",
        blurb: "Compile existing LaTeX tables and fragments into presentation objects.",
      },
    ],
  },
  {
    label: "Check and generate",
    summary: "Verify a deck before presenting it, and hand the format to an agent.",
    pages: [
      {
        slug: "layout-checks",
        source: "docs/layout-checks.md",
        label: "Layout checks",
        blurb: "Detect empty pages, overflow, clipped text, small type, and mistyped region paths.",
      },
      {
        slug: "ai-generation",
        source: "docs/ai-generation.md",
        label: "Generate with AI",
        blurb: "Give an agent the FrameSeq contract and iterate from layout diagnostics.",
      },
    ],
  },
  {
    label: "Present and export",
    summary: "Deliver the talk and hand the file over afterwards.",
    pages: [
      {
        slug: "presenter",
        source: "docs/presenter.md",
        label: "Presenter and remote",
        blurb: "Notes, next-slide preview, timer, synchronised controls, and a phone remote.",
      },
      {
        slug: "deployment",
        source: "docs/deployment.md",
        label: "Deploy HTML",
        blurb: "Publish a static presentation, use GitHub Pages, or build one portable file.",
      },
      {
        slug: "pptx",
        source: "docs/pptx.md",
        label: "Export PowerPoint",
        blurb: "Editable hybrid PPTX or pixel-faithful flattened slides.",
      },
    ],
  },
  {
    label: "Editor and command line",
    summary: "Drive FrameSeq from the tools you already use.",
    pages: [
      {
        slug: "vscode",
        source: "docs/vscode.md",
        label: "VS Code extension",
        blurb: "Split view, slide navigation, diagnostics, and export commands.",
      },
      {
        slug: "cli",
        source: "docs/cli.md",
        label: "CLI reference",
        blurb: "Development, remote control, HTML, PDF, PPTX, Typst, inspection, and checking.",
      },
    ],
  },
  {
    label: "Reference",
    summary: "Look something up. Not part of the reading path.",
    pages: [
      {
        slug: "function-guide",
        source: "docs/function-guide.md",
        label: "Function reference",
        blurb: "What each authoring function creates, its signature, parameters, and return value.",
      },
      {
        slug: "api-reference",
        source: "docs/api-reference.md",
        label: "API reference",
        blurb: "Exact TypeScript overloads, interfaces, and every public builder method.",
      },
      {
        slug: "advanced",
        source: "docs/advanced.md",
        label: "Advanced composition",
        blurb: "The uppercase object API and lower-level components.",
      },
      {
        slug: "changelog",
        source: "CHANGELOG.md",
        label: "Changelog",
        blurb: "User-visible changes across releases.",
      },
      {
        slug: "releasing",
        source: "docs/releasing.md",
        label: "Release automation",
        blurb: "npm Trusted Publishing and the version-tag workflow.",
      },
    ],
  },
];

export const documentationPages = documentationGroups.flatMap((group) => group.pages);
