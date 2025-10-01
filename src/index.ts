import { type PluginObj, types as t } from "@babel/core";
import type { NodePath } from "@babel/traverse";
import type { ConfigAPI } from "@babel/core";
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

function filenameToSnakeCase(filename: string): string {
  const basename = filename.split("/").pop() || filename;

  const lastDotIndex = basename.lastIndexOf(".");
  const nameWithoutExt =
    lastDotIndex > 0 ? basename.substring(0, lastDotIndex) : basename;

  return nameWithoutExt
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function generateUniqueId(componentName: string): string {
  const prefix = filenameToSnakeCase(componentName);
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${randomPart}`;
}

function getComponentName(path: NodePath): string | null {
  // For function declarations: function Button() {}
  if (path.isFunctionDeclaration() && path.node.id) {
    return path.node.id.name;
  }

  // For variable declarations with arrow functions: const Button = () => {}
  if (
    path.isVariableDeclarator() &&
    path.node.id &&
    t.isIdentifier(path.node.id)
  ) {
    return path.node.id.name;
  }

  return null;
}

function componentDataPlugin(
  _api: ConfigAPI,
  options: { filename?: string; skipFiles?: string[] } = {},
): PluginObj {
  const filename = options.filename || "";
  const skipFiles = options.skipFiles || ["ImageOptimizer.jsx"];

  // Skip adding metadata to virtual/generated files
  if (
    skipFiles.some(
      (skipFile) => filename === skipFile || filename.includes(skipFile),
    )
  ) {
    return {
      name: "babel-plugin-dom-editor",
      visitor: {},
    };
  }

  return {
    name: "babel-plugin-dom-editor",
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
  const componentId = generateUniqueId(componentName);

  // Handle function declarations: function Button() { return <jsx> }
  if (path.isFunctionDeclaration()) {
    path.traverse({
      ReturnStatement(returnPath: NodePath<ReturnStatement>) {
        processComponentReturn(returnPath, filename, componentId);
      },
    });
  }

  // Handle arrow functions: const Button = () => <jsx> or const Button = () => { return <jsx> }
  if (path.isVariableDeclarator() && path.node.init) {
    const func = path.node.init;

    if (t.isArrowFunctionExpression(func)) {
      // Direct return: const Button = () => <jsx>
      if (t.isJSXElement(func.body)) {
        addEditorMetadata(func.body, filename, componentId, true);
        processJSXChildren(func.body, componentId, true);
      } else if (t.isJSXFragment(func.body)) {
        addEditorMetadataToFragmentChildren(func.body, filename, componentId);
        addRenderedByToFragmentChildren(func.body, componentId);
      } else if (t.isCallExpression(func.body)) {
        const jsxElement = convertCreateElementToJSX(func.body);
        if (jsxElement) {
          addEditorMetadata(jsxElement, filename, componentId, true);
          processJSXChildren(jsxElement, componentId, true);
          func.body = jsxElement;
        }
      }
      // Block body: const Button = () => { return <jsx> }
      else if (t.isBlockStatement(func.body)) {
        path.traverse({
          ReturnStatement(returnPath: NodePath<ReturnStatement>) {
            processComponentReturn(returnPath, filename, componentId);
          },
        });
      }
    }

    if (t.isFunctionExpression(func)) {
      path.traverse({
        ReturnStatement(returnPath: NodePath<ReturnStatement>) {
          processComponentReturn(returnPath, filename, componentId);
        },
      });
    }
  }
}

function processComponentReturn(
  returnPath: NodePath<ReturnStatement>,
  filename: string,
  componentId: string,
): void {
  const argument = returnPath.node.argument;

  if (t.isJSXElement(argument)) {
    addEditorMetadata(argument, filename, componentId, true);
    processJSXChildren(argument, componentId, true);
  } else if (t.isJSXFragment(argument)) {
    addEditorMetadataToFragmentChildren(argument, filename, componentId);
    addRenderedByToFragmentChildren(argument, componentId);
  } else if (t.isCallExpression(argument)) {
    const jsxElement = convertCreateElementToJSX(argument);
    if (jsxElement) {
      addEditorMetadata(jsxElement, filename, componentId, true);
      processJSXChildren(jsxElement, componentId, true);
      returnPath.node.argument = jsxElement;
    }
  }
}

function addEditorMetadata(
  jsxElement: JSXElement,
  filename: string,
  editorId: string,
  isRoot = false,
): void {
  if (!filename) return;

  const openingElement: JSXOpeningElement = jsxElement.openingElement;
  const hasDataFile = openingElement.attributes.find(
    (attr): attr is JSXAttribute =>
      t.isJSXAttribute(attr) &&
      t.isJSXIdentifier(attr.name) &&
      attr.name.name === "data-file",
  );

  if (!hasDataFile) {
    if (isRoot) {
      openingElement.attributes.push(
        t.jsxAttribute(t.jsxIdentifier("data-file"), t.stringLiteral(filename)),
      );
      openingElement.attributes.push(
        t.jsxAttribute(
          t.jsxIdentifier("data-editor-id"),
          t.stringLiteral(editorId),
        ),
      );
    } else {
      openingElement.attributes.push(
        t.jsxAttribute(
          t.jsxIdentifier("data-rendered-by"),
          t.stringLiteral(editorId),
        ),
      );
    }
  }
}

function addEditorMetadataToFragmentChildren(
  jsxFragment: JSXFragment,
  filename: string,
  editorId: string,
): void {
  if (!filename || !jsxFragment.children) return;

  jsxFragment.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      addEditorMetadata(child, filename, editorId, true);
    }
  });
}

function processJSXChildren(
  jsxElement: JSXElement,
  componentId: string,
  wrapExpressions = false,
): void {
  if (!jsxElement.children) return;

  const processedChildren: JSXChild[] = [];
  let hasChanges = false;

  jsxElement.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      if (!isReactComponent(child)) {
        child.openingElement.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier("data-rendered-by"),
            t.stringLiteral(componentId),
          ),
        );
        processJSXChildren(child, componentId, false);
      }
      processedChildren.push(child);
    } else if (t.isJSXText(child)) {
      const textContent = child.value.trim();
      if (textContent) {
        const wrappedTextElement = t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier("span"), [
            t.jsxAttribute(
              t.jsxIdentifier("style"),
              t.jsxExpressionContainer(
                t.objectExpression([
                  t.objectProperty(
                    t.stringLiteral("display"),
                    t.stringLiteral("contents"),
                  ),
                ]),
              ),
            ),
            t.jsxAttribute(
              t.jsxIdentifier("data-rendered-by"),
              t.stringLiteral(componentId),
            ),
          ]),
          t.jsxClosingElement(t.jsxIdentifier("span")),
          [child],
        );
        processedChildren.push(wrappedTextElement);
        hasChanges = true;
      } else {
        processedChildren.push(child);
      }
    } else if (t.isJSXExpressionContainer(child) && wrapExpressions) {
      // Special handling for {children} - don't wrap it, let it flow through unchanged
      if (
        t.isIdentifier(child.expression) &&
        child.expression.name === "children"
      ) {
        processedChildren.push(child);
      } else if (t.isIdentifier(child.expression)) {
        const wrappedExpressionElement = t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier("span"), [
            t.jsxAttribute(
              t.jsxIdentifier("style"),
              t.jsxExpressionContainer(
                t.objectExpression([
                  t.objectProperty(
                    t.stringLiteral("display"),
                    t.stringLiteral("contents"),
                  ),
                ]),
              ),
            ),
            t.jsxAttribute(
              t.jsxIdentifier("data-rendered-by"),
              t.stringLiteral(componentId),
            ),
          ]),
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

  if (hasChanges) {
    jsxElement.children = processedChildren;
  }
}

function addRenderedByToFragmentChildren(
  jsxFragment: JSXFragment,
  componentId: string,
): void {
  if (!jsxFragment.children) return;

  jsxFragment.children.forEach((child) => {
    if (t.isJSXElement(child)) {
      processJSXChildren(child, componentId);
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
