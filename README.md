# Babel Plugin: DOM Editor

A Babel plugin that adds DOM metadata for visual editing functionality. This plugin processes React JSX elements during compilation to inject data attributes that enable element selection and ownership tracking in visual editors.

## Features

- **Component Root Detection**: Automatically identifies React component boundaries
- **Unique ID Generation**: Creates stable, unique identifiers for each component
- **Ownership Tracking**: Tracks which component rendered each DOM element
- **Text Node Wrapping**: Wraps text content to enable proper selection and editing
- **PascalCase Detection**: Distinguishes React components from HTML elements
- **Fragment Support**: Handles JSX fragments correctly

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
- `ReturnStatement` nodes with JSX elements
- `ArrowFunctionExpression` nodes that directly return JSX

### Metadata Injection

For each component, the plugin:

1. **Generates a unique ID** using filename + timestamp + random string
   ```
   Format: {filename}_{timestamp}_{random}
   Example: button_mg7g8b3h_qi8l3s
   ```

2. **Adds root element attributes**:
   - `data-file`: Source file path
   - `data-editor-id`: Unique component ID

3. **Adds ownership tracking**: `data-rendered-by` to child elements

### Text Node Wrapping

The plugin wraps text content in components to enable selection:

#### Direct Text Nodes
```jsx
// Before
<div>Hello World</div>

// After  
<div data-file="src/Component.js" data-editor-id="component_abc123">
  <span style={{display: 'contents'}} data-rendered-by="component_abc123">
    Hello World
  </span>
</div>
```

#### Expression Containers (children props)
```jsx
// Before
<button>{children}</button>

// After
<button data-file="src/Button.js" data-editor-id="button_def456">
  <span style={{display: 'contents'}} data-rendered-by="button_def456">
    {children}
  </span>
</button>
```

## Component Ownership Tracking

The plugin uses PascalCase detection to identify React components vs HTML elements:

- **React Components** (PascalCase): `Button`, `Header`, `Card`
  - Skip adding `data-rendered-by` (they have their own `data-editor-id`)
  
- **HTML Elements** (lowercase): `div`, `button`, `span`
  - Add `data-rendered-by` pointing to parent component ID

## Configuration Options

### `filename` (string)
The current file being processed. Used to generate unique IDs and set `data-file` attribute.

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
      data-file="src/Button.js" 
      data-editor-id="button_mg7g8b3h_qi8l3s"
    >
      <span 
        style={{display: 'contents'}} 
        data-rendered-by="button_mg7g8b3h_qi8l3s"
      >
        {children}
      </span>
    </button>
  );
};
```

## Visual Editor Integration

The injected metadata enables:

1. **Element Selection**: Click handlers use `data-editor-id` to identify components
2. **Ownership Tracking**: `data-rendered-by` determines which file to edit
3. **AST Matching**: Unique IDs enable finding elements in parsed AST
4. **Text Editing**: Wrapped text nodes can be selected and modified

## API Reference

### Main Plugin Function

```typescript
function componentDataPlugin(
  api: ConfigAPI, 
  options: { filename?: string; skipFiles?: string[] }
): PluginObj
```

### Utility Functions

#### `filenameToSnakeCase(filename: string): string`
Converts filename to snake_case for use in IDs.

#### `generateUniqueId(filename: string): string`
Creates unique identifiers with filename prefix.

#### `isReactComponent(jsxElement: JSXElement): boolean`
Detects React components using PascalCase naming convention.

## Limitations

1. Only processes direct JSX returns from components
2. PascalCase detection may miss edge cases  
3. Adds spans that could affect styling (mitigated with `display: contents`)
4. Text nodes in deeply nested HTML elements may not be wrapped correctly

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