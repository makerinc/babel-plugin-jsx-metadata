import type { ConfigAPI } from "@babel/core";
import crypto from "node:crypto";
import type { NodePath } from "@babel/traverse";
import { type PluginObj, types as t } from "@babel/core";
import type {
  CallExpression,
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXOpeningElement,
  JSXSpreadChild,
  JSXText,
  ReturnStatement,
} from "@babel/types";

type JSXChild =
  | JSXText
  | JSXElement
  | JSXExpressionContainer
  | JSXFragment
  | JSXSpreadChild;

type JSXElementLike = JSXElement | JSXText | JSXExpressionContainer;

let elementCounter = 0;
let elementPath: string[] = [];

function resetElementCounter() {
  elementCounter = 0;
  elementPath = [];
}

function pushElementToPath(elementName: string) {
  elementPath.push(elementName);
}

function popElementFromPath() {
  elementPath.pop();
}

function getNextElementId(filename: string): string {
  // Include parent tags in path, but use generic 'element' for current item
  const pathStr = elementPath.length > 0 ? elementPath.join('.') + '.element' : 'element';
  return `${pathStr}[${elementCounter++}]@${filename}`;
}

function getElementTagName(jsxElement: JSXElementLike): string {
  if (t.isJSXElement(jsxElement)) {
    if (t.isJSXIdentifier(jsxElement.openingElement.name)) {
      return jsxElement.openingElement.name.name;
    }
  }
  if (t.isJSXText(jsxElement) || t.isJSXExpressionContainer(jsxElement)) {
    return "span";
  }
  return "unknown";
}


function setOrUpdateAttribute(
  openingElement: JSXOpeningElement,
  name: string,
  value: string,
): void {
  // Find existing attribute
  const existingAttrIndex = openingElement.attributes.findIndex(
    (attr): attr is JSXAttribute =>
      t.isJSXAttribute(attr) &&
      t.isJSXIdentifier(attr.name) &&
      attr.name.name === name,
  );

  const newAttribute = t.jsxAttribute(
    t.jsxIdentifier(name),
    t.stringLiteral(value),
  );

  if (existingAttrIndex !== -1) {
    // Update existing attribute
    openingElement.attributes[existingAttrIndex] = newAttribute;
  } else {
    // Add new attribute
    openingElement.attributes.push(newAttribute);
  }
}

function addLineAttributes(
  openingElement: JSXOpeningElement,
  jsxElement: JSXElementLike,
  filename: string,
): void {
  const startLine = jsxElement.loc?.start.line;
  const endLine = jsxElement.loc?.end.line;
  const startColumn = jsxElement.loc?.start.column;
  const endColumn = jsxElement.loc?.end.column;

  const internalId = getNextElementId(filename);

  const editorId = crypto
    .createHash("md5")
    .update(internalId)
    .digest("hex")
    .substring(0, 12);

  setOrUpdateAttribute(openingElement, "data-editor-id", editorId);

  if (startLine) {
    setOrUpdateAttribute(openingElement, "data-component-line-start", startLine.toString());
  }
  if (endLine) {
    setOrUpdateAttribute(openingElement, "data-component-line-end", endLine.toString());
  }
  if (startColumn !== undefined) {
    setOrUpdateAttribute(openingElement, "data-component-col-start", startColumn.toString());
  }
  if (endColumn !== undefined) {
    setOrUpdateAttribute(openingElement, "data-component-col-end", endColumn.toString());
  }
}

function addComponentAttributes(
  openingElement: JSXOpeningElement,
  filename: string,
  componentName: string,
  jsxElement: JSXElement,
): void {
  setOrUpdateAttribute(openingElement, "data-component-file", filename);
  setOrUpdateAttribute(openingElement, "data-component-name", componentName);
  addLineAttributes(openingElement, jsxElement, filename);
}

function addRenderedByAttributes(
  openingElement: JSXOpeningElement,
  filename: string,
  jsxElement: JSXElementLike,
): void {
  setOrUpdateAttribute(openingElement, "data-rendered-by", filename);
  addLineAttributes(openingElement, jsxElement, filename);
}

function getComponentName(path: NodePath): string | null {
  if (
    (path.isVariableDeclarator() || path.isFunctionDeclaration()) &&
    path.node.id &&
    t.isIdentifier(path.node.id)
  ) {
    return path.node.id.name;
  }

  return null;
}

export type options = {
  filename?: string;
  skipFiles?: string[];
};

function componentDataPlugin(
  _api: ConfigAPI,
  options: options = {},
): PluginObj {
  const filename = options.filename || "";
  const skipFiles = options.skipFiles || [];

  // Skip adding metadata to virtual/generated files
  if (
    skipFiles.some(
      (skipFile) => filename === skipFile || filename.includes(skipFile),
    )
  ) {
    return {
      name: "babel-plugin-jsx-metadata",
      visitor: {},
    };
  }

  return {
    name: "babel-plugin-jsx-metadata",
    visitor: {
      // Handle function declarations: function Button() {}
      FunctionDeclaration(path) {
        const componentName = getComponentName(path);
        if (componentName) {
          processComponent(path, componentName, filename);
        }
      },

      // Handle variable declarations with arrow functions: const Button = () => {}
      VariableDeclarator(path) {
        const componentName = getComponentName(path);
        if (
          componentName &&
          (t.isArrowFunctionExpression(path.node.init) ||
            t.isFunctionExpression(path.node.init))
        ) {
          processComponent(path, componentName, filename);
        }
      },
    },
  };
}

function processComponent(
  path: NodePath,
  componentName: string,
  filename: string,
): void {
  resetElementCounter();
  // Handle function declarations: function Button() { return <jsx> }
  if (path.isFunctionDeclaration()) {
    path.traverse({
      ReturnStatement(returnPath: NodePath<ReturnStatement>) {
        processComponentReturn(returnPath, filename, componentName);
      },
    });
  }

  // Handle arrow functions: const Button = () => <jsx> or const Button = () => { return <jsx> }
  if (path.isVariableDeclarator() && path.node.init) {
    const func = path.node.init;

    if (t.isArrowFunctionExpression(func)) {
      // Direct return: const Button = () => <jsx>
      if (t.isJSXElement(func.body)) {
        addEditorMetadata(func.body, filename, componentName, true);
        processJSXChildren(func.body, filename, false); // Root element: no text wrapping
      } else if (t.isJSXFragment(func.body)) {
        addEditorMetadataToFragmentChildren(func.body, filename, componentName);
        addRenderedByToFragmentChildren(func.body, filename);
      } else if (t.isCallExpression(func.body)) {
        const jsxElement = convertCreateElementToJSX(func.body);
        if (jsxElement) {
          addEditorMetadata(jsxElement, filename, componentName, true);
          processJSXChildren(jsxElement, filename, false); // Root element: no text wrapping
          func.body = jsxElement;
        }
      }
      // Block body: const Button = () => { return <jsx> }
      else if (t.isBlockStatement(func.body)) {
        path.traverse({
          ReturnStatement(returnPath: NodePath<ReturnStatement>) {
            processComponentReturn(returnPath, filename, componentName);
          },
        });
      }
    }

    if (t.isFunctionExpression(func)) {
      path.traverse({
        ReturnStatement(returnPath: NodePath<ReturnStatement>) {
          processComponentReturn(returnPath, filename, componentName);
        },
      });
    }
  }
}

function processComponentReturn(
  returnPath: NodePath<ReturnStatement>,
  filename: string,
  componentName: string,
): void {
  const argument = returnPath.node.argument;

  if (t.isJSXElement(argument)) {
    addEditorMetadata(argument, filename, componentName, true);
    processJSXChildren(argument, filename, false); // Root element: no text wrapping
  } else if (t.isJSXFragment(argument)) {
    addEditorMetadataToFragmentChildren(argument, filename, componentName);
    addRenderedByToFragmentChildren(argument, filename);
  } else if (t.isCallExpression(argument)) {
    const jsxElement = convertCreateElementToJSX(argument);
    if (jsxElement) {
      addEditorMetadata(jsxElement, filename, componentName, true);
      processJSXChildren(jsxElement, filename, false); // Root element: no text wrapping
      returnPath.node.argument = jsxElement;
    }
  }
}

function addEditorMetadata(
  jsxElement: JSXElement,
  filename: string,
  componentName: string,
  isRoot = false,
): void {
  if (!filename) return;

  const openingElement: JSXOpeningElement = jsxElement.openingElement;

  if (isRoot) {
    // Always update/add component attributes (replace old with new)
    addComponentAttributes(openingElement, filename, componentName, jsxElement);
  } else {
    // Always update/add rendered-by attributes (replace old with new)
    addRenderedByAttributes(openingElement, filename, jsxElement);
  }
}

function addEditorMetadataToFragmentChildren(
  jsxFragment: JSXFragment,
  filename: string,
  componentName: string,
): void {
  if (!filename || !jsxFragment.children) return;

  jsxFragment.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      addEditorMetadata(child, filename, componentName, true);
    }
  });
}

function processJSXChildren(
  jsxElement: JSXElement,
  filename: string,
  wrapExpressions = false,
): void {
  if (!jsxElement.children) return;

  // Push current element to path before processing children
  const currentTagName = getElementTagName(jsxElement);
  pushElementToPath(currentTagName);

  const processedChildren: JSXChild[] = [];
  let hasChanges = false;

  jsxElement.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      if (!isReactComponent(child)) {
        // HTML elements: just add data-rendered-by attribute, no text wrapping
        addRenderedByAttributes(child.openingElement, filename, child);
        processJSXChildren(child, filename, false);
      } else {
        // React components: process their children with text wrapping enabled
        processJSXChildren(child, filename, true);
      }
      processedChildren.push(child);
    } else if (t.isJSXText(child)) {
      const textContent = child.value.trim();
      if (textContent && wrapExpressions) {
        // Only wrap text when we're inside a React component (wrapExpressions = true)
        const spanOpeningElement = t.jsxOpeningElement(t.jsxIdentifier("span"), []);
        addRenderedByAttributes(spanOpeningElement, filename, child);

        const wrappedTextElement = t.jsxElement(
          spanOpeningElement,
          t.jsxClosingElement(t.jsxIdentifier("span")),
          [child],
        );
        processedChildren.push(wrappedTextElement);
        hasChanges = true;
      } else {
        processedChildren.push(child);
      }
    } else if (t.isJSXExpressionContainer(child) && wrapExpressions) {
      if (t.isIdentifier(child.expression)) {
        const spanOpeningElement = t.jsxOpeningElement(t.jsxIdentifier("span"), []);
        addRenderedByAttributes(spanOpeningElement, filename, child);

        const wrappedExpressionElement = t.jsxElement(
          spanOpeningElement,
          t.jsxClosingElement(t.jsxIdentifier("span")),
          [child],
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

  // Pop current element from path after processing children
  popElementFromPath();

  if (hasChanges) {
    jsxElement.children = processedChildren;
  }
}

function addRenderedByToFragmentChildren(
  jsxFragment: JSXFragment,
  filename: string,
): void {
  if (!jsxFragment.children) return;

  jsxFragment.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      processJSXChildren(child, filename);
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

function convertCreateElementToJSX(
  callExpression: CallExpression,
): JSXElement | null {
  if (
    t.isMemberExpression(callExpression.callee) &&
    t.isIdentifier(callExpression.callee.object, { name: "React" }) &&
    t.isIdentifier(callExpression.callee.property, { name: "createElement" })
  ) {
    const [elementType, props, ...children] = callExpression.arguments;

    if (t.isStringLiteral(elementType)) {
      const attributes: JSXAttribute[] = [];

      if (t.isObjectExpression(props)) {
        props.properties.forEach((prop) => {
          if (t.isObjectProperty(prop)) {
            let keyName: string | null = null;

            if (t.isStringLiteral(prop.key)) {
              keyName = prop.key.value;
            } else if (t.isIdentifier(prop.key)) {
              keyName = prop.key.name;
            }

            if (keyName) {
              if (t.isStringLiteral(prop.value)) {
                attributes.push(
                  t.jsxAttribute(
                    t.jsxIdentifier(keyName),
                    t.stringLiteral(prop.value.value),
                  ),
                );
              } else if (t.isExpression(prop.value)) {
                attributes.push(
                  t.jsxAttribute(
                    t.jsxIdentifier(keyName),
                    t.jsxExpressionContainer(prop.value),
                  ),
                );
              }
            }
          }
        });
      }

      const jsxChildren: JSXChild[] = [];
      children.forEach((child) => {
        if (t.isStringLiteral(child)) {
          jsxChildren.push(t.jsxText(child.value));
        } else if (t.isCallExpression(child)) {
          const nestedJSX = convertCreateElementToJSX(child);
          if (nestedJSX) {
            jsxChildren.push(nestedJSX);
          } else if (t.isExpression(child)) {
            jsxChildren.push(t.jsxExpressionContainer(child));
          }
        } else if (t.isExpression(child)) {
          jsxChildren.push(t.jsxExpressionContainer(child));
        }
      });

      return t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier(elementType.value), attributes),
        t.jsxClosingElement(t.jsxIdentifier(elementType.value)),
        jsxChildren,
      );
    }
  }

  return null;
}

export default componentDataPlugin;
