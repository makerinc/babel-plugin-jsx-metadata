import { type PluginObj, types as t } from '@babel/core';
import type { ConfigAPI } from '@babel/core';
import type {
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXOpeningElement,
  JSXSpreadChild,
  JSXText
} from '@babel/types';

type JSXChild = JSXText | JSXElement | JSXExpressionContainer | JSXFragment | JSXSpreadChild;

function filenameToSnakeCase(filename: string): string {
  const basename = filename.split('/').pop() || filename;
  
  const lastDotIndex = basename.lastIndexOf('.');
  const nameWithoutExt = lastDotIndex > 0 ? basename.substring(0, lastDotIndex) : basename;

  return nameWithoutExt
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function generateUniqueId(filename: string): string {
  const prefix = filenameToSnakeCase(filename);
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${randomPart}`;
}

function componentDataPlugin(_api: ConfigAPI, options: { filename?: string; skipFiles?: string[] } = {}): PluginObj {
  const filename = options.filename || '';
  const skipFiles = options.skipFiles || ['ImageOptimizer.jsx'];

  // Skip adding metadata to virtual/generated files
  if (skipFiles.some(skipFile => filename === skipFile || filename.includes(skipFile))) {
    return {
      name: 'babel-plugin-dom-editor',
      visitor: {}
    };
  }

  return {
    name: 'babel-plugin-dom-editor',
    visitor: {
      Program(path) {
        const componentId = generateUniqueId(filename);

        path.traverse({
          ReturnStatement(returnPath) {
            const argument = returnPath.node.argument;
            if (t.isJSXElement(argument)) {
              addEditorMetadata(argument, filename, componentId, true);
              processComponentChildren(argument, componentId);
            } else if (t.isJSXFragment(argument)) {
              addEditorMetadataToFragmentChildren(argument, filename, componentId);
              addRenderedByToFragmentChildren(argument, componentId);
            }
          },

          ArrowFunctionExpression(arrowPath) {
            if (t.isJSXElement(arrowPath.node.body)) {
              addEditorMetadata(arrowPath.node.body, filename, componentId, true);
              processComponentChildren(arrowPath.node.body, componentId);
            } else if (t.isJSXFragment(arrowPath.node.body)) {
              addEditorMetadataToFragmentChildren(arrowPath.node.body, filename, componentId);
              addRenderedByToFragmentChildren(arrowPath.node.body, componentId);
            }
          }
        });
      }
    }
  };
}

function addEditorMetadata(
  jsxElement: JSXElement,
  filename: string,
  editorId: string,
  isRoot = false
): void {
  if (!filename) return;

  const openingElement: JSXOpeningElement = jsxElement.openingElement;
  const hasDataFile = openingElement.attributes.find(
    (attr): attr is JSXAttribute =>
      t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'data-file'
  );

  if (!hasDataFile) {
    if (isRoot) {
      openingElement.attributes.push(
        t.jsxAttribute(t.jsxIdentifier('data-file'), t.stringLiteral(filename))
      );
      openingElement.attributes.push(
        t.jsxAttribute(t.jsxIdentifier('data-editor-id'), t.stringLiteral(editorId))
      );
    } else {
      openingElement.attributes.push(
        t.jsxAttribute(t.jsxIdentifier('data-rendered-by'), t.stringLiteral(editorId))
      );
    }
  }
}

function addEditorMetadataToFragmentChildren(
  jsxFragment: JSXFragment,
  filename: string,
  editorId: string
): void {
  if (!filename || !jsxFragment.children) return;

  jsxFragment.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      addEditorMetadata(child, filename, editorId, true);
    }
  });
}

function addRenderedByToChildren(
  jsxElement: JSXElement,
  componentId: string,
  isComponentRoot = false
): void {
  if (!jsxElement.children) return;

  const processedChildren: JSXChild[] = [];
  let hasChanges = false;

  jsxElement.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      if (!isReactComponent(child)) {
        child.openingElement.attributes.push(
          t.jsxAttribute(t.jsxIdentifier('data-rendered-by'), t.stringLiteral(componentId))
        );
        addRenderedByToChildren(child, componentId, false);
      }
      processedChildren.push(child);
    } else if (t.isJSXText(child)) {
      const textContent = child.value.trim();
      if (textContent && isComponentRoot) {
        const wrappedTextElement = t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier('span'), [
            t.jsxAttribute(
              t.jsxIdentifier('style'),
              t.jsxExpressionContainer(
                t.objectExpression([
                  t.objectProperty(t.stringLiteral('display'), t.stringLiteral('contents'))
                ])
              )
            ),
            t.jsxAttribute(t.jsxIdentifier('data-rendered-by'), t.stringLiteral(componentId))
          ]),
          t.jsxClosingElement(t.jsxIdentifier('span')),
          [child]
        );
        processedChildren.push(wrappedTextElement);
        hasChanges = true;
      } else {
        processedChildren.push(child);
      }
    } else {
      processedChildren.push(child);
    }
  });

  if (hasChanges) {
    jsxElement.children = processedChildren;
  }
}

function addRenderedByToFragmentChildren(jsxFragment: JSXFragment, componentId: string): void {
  if (!jsxFragment.children) return;

  jsxFragment.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      addRenderedByToChildren(child, componentId);
    }
  });
}

function isReactComponent(jsxElement: JSXElement): boolean {
  if (t.isJSXIdentifier(jsxElement.openingElement.name)) {
    const tagName = jsxElement.openingElement.name.name;
    return /^[A-Z]/.test(tagName);
  }
  return false;
}

function processComponentChildren(jsxElement: JSXElement, componentId: string): void {
  if (!jsxElement.children) return;

  const processedChildren: JSXChild[] = [];
  let hasChanges = false;

  jsxElement.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      if (!isReactComponent(child)) {
        child.openingElement.attributes.push(
          t.jsxAttribute(t.jsxIdentifier('data-rendered-by'), t.stringLiteral(componentId))
        );
        addRenderedByToChildren(child, componentId, false);
      }
      processedChildren.push(child);
    } else if (t.isJSXText(child)) {
      const textContent = child.value.trim();
      if (textContent) {
        const wrappedTextElement = t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier('span'), [
            t.jsxAttribute(
              t.jsxIdentifier('style'),
              t.jsxExpressionContainer(
                t.objectExpression([
                  t.objectProperty(t.stringLiteral('display'), t.stringLiteral('contents'))
                ])
              )
            ),
            t.jsxAttribute(t.jsxIdentifier('data-rendered-by'), t.stringLiteral(componentId))
          ]),
          t.jsxClosingElement(t.jsxIdentifier('span')),
          [child]
        );
        processedChildren.push(wrappedTextElement);
        hasChanges = true;
      } else {
        processedChildren.push(child);
      }
    } else if (t.isJSXExpressionContainer(child)) {
      if (t.isIdentifier(child.expression)) {
        const wrappedExpressionElement = t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier('span'), [
            t.jsxAttribute(
              t.jsxIdentifier('style'),
              t.jsxExpressionContainer(
                t.objectExpression([
                  t.objectProperty(t.stringLiteral('display'), t.stringLiteral('contents'))
                ])
              )
            ),
            t.jsxAttribute(t.jsxIdentifier('data-rendered-by'), t.stringLiteral(componentId))
          ]),
          t.jsxClosingElement(t.jsxIdentifier('span')),
          [child]
        );
        processedChildren.push(wrappedExpressionElement);
        hasChanges = true;
      } else {
        processedChildren.push(child);
      }
    } else {
      processedChildren.push(child);
    }
  });

  if (hasChanges) {
    jsxElement.children = processedChildren;
  }
}

export default componentDataPlugin;