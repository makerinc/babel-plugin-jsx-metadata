# Babel Plugin: DOM Editor

A Babel plugin that adds DOM metadata for visual editing functionality. This plugin processes React JSX elements during compilation to inject data attributes that enable element selection and ownership tracking in visual editors.

## Features

- **Component Root Detection**: Automatically identifies React component boundaries
- **File-based Ownership**: Uses simple file paths for tracking element authorship
- **Line Number Tracking**: Adds source line numbers for precise element location
- **Text Node Wrapping**: Wraps text content to enable proper selection and editing
- **PascalCase Detection**: Distinguishes React components from HTML elements
- **Fragment Support**: Handles JSX fragments correctly
- **Cross-Component Authorship**: Preserves text authorship when passed between components

## Installation

```bash
npm install babel-plugin-dom-editor
```

## Usage

Add the plugin to your Babel configuration:

```javascript
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-dom-editor', {
      filename: 'src/Component.js', // Current file being processed
      skipFiles: ['ImageOptimizer.jsx'] // Optional: files to skip
    }]
  ]
};
```

## How It Works

### Component Root Detection

The plugin identifies React component return values by traversing:
- `FunctionDeclaration` nodes with JSX returns
- `VariableDeclarator` nodes with arrow functions returning JSX

### Metadata Injection

For each component, the plugin:

1. **Adds component metadata** to root elements:
   - `data-component-file`: Source file path
   - `data-component-name`: Component name (e.g., "Button", "Hero")
   - `data-component-line`: Source line number

2. **Adds ownership tracking** to child elements:
   - `data-rendered-by`: File path of the authoring component
   - `data-component-line`: Source line number

### Text Node Wrapping

The plugin wraps text content in components to enable selection:

#### Direct Text Nodes
```jsx
// Before
<div>Hello World</div>

// After
<div data-component-file="src/Component.js" data-component-name="Component" data-component-line="5">
  <span style={{display: 'contents'}} data-rendered-by="src/Component.js" data-component-line="5">
    Hello World
  </span>
</div>
```

#### Cross-Component Authorship
```jsx
// In Hero.js - Hero passes text to Button
<Button variant="primary">Get Started Today</Button>

// Button receives text from Hero and preserves authorship
<button data-component-file="src/Hero.js" data-component-name="Button" data-component-line="37">
  {children} // NOT wrapped - preserves Hero's authorship of "Get Started Today"
</button>
```

## Component Ownership Tracking

The plugin uses PascalCase detection to identify React components vs HTML elements:

- **React Components** (PascalCase): `Button`, `Header`, `Card`
  - Skip adding `data-rendered-by` (they have their own component metadata)

- **HTML Elements** (lowercase): `div`, `button`, `span`
  - Add `data-rendered-by` pointing to the file that authored them
  - Add `data-component-line` with source line number

## Configuration Options

### `filename` (string)
The current file being processed. Used to set `data-component-file` and `data-rendered-by` attributes.

### `skipFiles` (string[])
Array of filenames or patterns to skip processing. Defaults to `['ImageOptimizer.jsx']`.

```javascript
{
  filename: 'src/components/Button.tsx',
  skipFiles: ['ImageOptimizer.jsx', 'generated-components.js']
}
```

## Output Example

Given this component:
```jsx
const Button = ({ children, variant }) => {
  return (
    <button className={`btn btn-${variant}`}>
      {children}
    </button>
  );
};
```

The plugin transforms it to:
```jsx
const Button = ({ children, variant }) => {
  return (
    <button
      className={`btn btn-${variant}`}
      data-component-file="src/Button.js"
      data-component-name="Button"
      data-component-line="3"
    >
      {children}
    </button>
  );
};
```

Note how `{children}` is NOT wrapped to preserve cross-component authorship tracking.

## Data Attributes Reference

### Component Root Elements
- **`data-component-file`**: File path where the component is defined (e.g., `"src/Button.js"`)
- **`data-component-name`**: Component name (e.g., `"Button"`, `"Hero"`)
- **`data-component-line`**: Source line number where the JSX element starts

### Child Elements
- **`data-rendered-by`**: File path of the component that authored this element
- **`data-component-line`**: Source line number where the element was defined

### Text Spans
Automatically wrapped text nodes get:
- **`data-rendered-by`**: File path of the authoring component
- **`data-component-line`**: Source line number of the text
- **`style={{display: 'contents'}}`**: Preserves layout while enabling selection

## Visual Editor Integration

The injected metadata enables:

1. **Element Selection**: Click handlers use `data-component-name` to identify components
2. **File Navigation**: `data-component-file` determines which file to open for editing
3. **Line Jumping**: `data-component-line` enables jumping to exact source locations
4. **Ownership Tracking**: `data-rendered-by` determines which file authored each element
5. **Text Editing**: Wrapped text nodes can be selected and modified while preserving authorship

## API Reference

### Main Plugin Function

```typescript
function componentDataPlugin(
  api: ConfigAPI,
  options: { filename?: string; skipFiles?: string[] }
): PluginObj
```

### Utility Functions

#### `getComponentName(path: NodePath): string | null`
Extracts component name from function declarations and variable declarators.

#### `isReactComponent(jsxElement: JSXElement): boolean`
Detects React components using PascalCase naming convention.

#### `addEditorMetadata(jsxElement, filename, componentName, isRoot)`
Adds component metadata to JSX elements.

## Limitations

1. Only processes direct JSX returns from components
2. PascalCase detection may miss edge cases
3. Adds spans that could affect styling (mitigated with `display: contents`)
4. Line numbers depend on source maps for accuracy in complex build setups
5. Cross-component text authorship requires careful `{children}` handling

## Development

```bash
# Build the plugin
npm run build

# Run tests
npm test

# Clean build artifacts
npm run clean
```

## License

MIT
