# Babel Plugin: JSX Metadata

A Babel plugin that injects lightweight metadata into JSX elements for visual editor integration. This plugin processes JSX elements during compilation to inject minimal data attributes that enable component tracking, authorship detection, and stable element identification in visual editing tools.

## Installation

```bash
npm install babel-plugin-jsx-metadata
```

## Usage

Add the plugin to your Babel configuration:

```javascript
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-jsx-metadata', {
      filename: 'src/Component.js', // Current file being processed
      skipFiles: ['SkipMe.jsx'] // Optional: files to skip
    }]
  ]
};
```

## How It Works

### Component Root Detection

The plugin identifies JSX component return values by traversing:
- `FunctionDeclaration` nodes with JSX returns
- `VariableDeclarator` nodes with arrow functions returning JSX

### Metadata Injection

For each JSX component, the plugin:

1. **Adds component metadata** to root elements:
   - `data-component-file`: Source file path
   - `data-component-name`: Component name (e.g., "Button", "Hero")
   - `data-editor-id`: Stable 12-character hash for persistent element tracking

2. **Adds ownership tracking** to child elements:
   - `data-rendered-by`: File path of the authoring component  
   - `data-editor-id`: Stable 12-character hash for persistent element tracking

### Text Node Wrapping

The plugin wraps text content in components to enable selection:

#### Direct Text Nodes
```jsx
// Before
<div>
  Hello World
</div>

// After
<div data-rendered-by="src/Component.js" data-editor-id="7ca930b58636">
    Hello World
</div>
```

#### Cross-Component Authorship
```jsx
// In Hero.js - Hero passes text to Button
<Button variant="primary">Get Started Today</Button>

// Button receives text from Hero and preserves authorship
<button data-component-file="src/components/Button.js" data-component-name="Button" data-editor-id="418a66f72141">
  <span data-rendered-by="src/Hero.js" data-editor-id="8f4207890d1b"> {children} </span>
</button>
```

## Component Ownership Tracking

The plugin uses PascalCase detection to identify JSX components vs HTML elements:

- **JSX Components** (PascalCase): `Button`, `Header`, `Card`
  - Skip adding `data-rendered-by` (they have their own component metadata)

- **HTML Elements** (lowercase): `div`, `button`, `span`
  - Add `data-rendered-by` pointing to the file that authored them
  - Add `data-editor-id` for stable element identification

## Configuration Options

### `filename` (string)
The current file being processed. Used to set `data-component-file` and `data-rendered-by` attributes.

### `skipFiles` (string[])
Array of filenames or patterns to skip processing. Defaults to `[]`.

```javascript
{
  filename: 'src/components/Button.tsx',
  skipFiles: ['generated-components.js']
}
```

## Data Attributes Reference

### Component Root Elements
- **`data-component-file`**: File path where the component is defined (e.g., `"src/Button.js"`)
- **`data-component-name`**: Component name (e.g., `"Button"`, `"Hero"`)
- **`data-editor-id`**: Stable 12-character hash for persistent element tracking (e.g., `"418a66f72141"`)

### Child Elements
- **`data-rendered-by`**: File path of the component that authored this element
- **`data-editor-id`**: Stable 12-character hash for persistent element tracking

### Text Spans
Automatically wrapped text nodes get:
- **`data-rendered-by`**: File path of the authoring component
- **`data-editor-id`**: Stable 12-character hash for persistent element tracking

## Editor ID Generation

The plugin generates stable, collision-resistant IDs for each element:

- **Hash-based**: Uses MD5 hash of element path and position for consistency
- **Collision-safe**: Automatically resolves ID conflicts within the same file  
- **Preservation**: Keeps existing unique IDs when possible to avoid unnecessary changes
- **File-scoped**: IDs are unique within each file to prevent conflicts


## Visual Editor Integration

The injected metadata enables:

1. **Element Selection**: Click handlers use `data-component-name` and `data-editor-id` to identify components
2. **File Navigation**: `data-component-file` determines which file to open for editing
3. **Persistent Tracking**: `data-editor-id` provides stable element identification across code changes
4. **Ownership Tracking**: `data-rendered-by` determines which file authored each element
5. **Text Editing**: Wrapped text nodes can be selected and modified while preserving authorship
6. **Collision-free Editing**: Hash-based IDs prevent conflicts when multiple editors work simultaneously

## API Reference

### Main Plugin Function

```typescript
function componentDataPlugin(
  api: ConfigAPI,
  options: { filename?: string; skipFiles?: string[] }
): PluginObj
```

## Limitations

1. Only processes direct JSX returns from components
2. PascalCase detection may miss edge cases  
3. Adds spans that could affect styling
4. Cross-component text authorship requires careful `{children}` handling
5. IDs are generated deterministically but may change if element structure changes significantly

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
