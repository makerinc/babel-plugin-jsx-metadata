import type { ConfigAPI } from "@babel/core";
import crypto from "node:crypto";
import type { NodePath } from "@babel/traverse";
import { type PluginObj, types as t } from "@babel/core";
import { parse } from "@babel/parser";
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

namespace AttachMetadata {
  type JSXChild =
    | JSXText
    | JSXElement
    | JSXExpressionContainer
    | JSXFragment
    | JSXSpreadChild;

  type JSXElementLike = JSXElement | JSXText | JSXExpressionContainer;

  type IdGenerationContext = {
    filename: string;
    usedIds: Set<string>;
    elementCounter: number;
    elementPath: string[];
  };

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

  function assignElementId(
    openingElement: JSXOpeningElement,
    context: IdGenerationContext,
  ): void {
    const existingIdAttr = openingElement.attributes.find(
      (attr): attr is JSXAttribute =>
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        attr.name.name === "data-editor-id",
    );

    let finalId: string;

    if (existingIdAttr && t.isStringLiteral(existingIdAttr.value)) {
      const existingId = existingIdAttr.value.value;

      if (
        existingId &&
        existingId.trim() !== "" &&
        !context.usedIds.has(existingId)
      ) {
        finalId = existingId;
      } else {
        finalId = generateNewId(context);
      }
    } else {
      finalId = generateNewId(context);
    }

    context.usedIds.add(finalId);

    setOrUpdateAttribute(openingElement, "data-editor-id", finalId);
  }

  function generateNewId(context: IdGenerationContext): string {
    let newId: string;

    do {
      const pathStr =
        context.elementPath.length > 0
          ? `${context.elementPath.join(".")}.element`
          : "element";
      const internalId = `${pathStr}[${context.elementCounter++}]@${context.filename}`;

      newId = crypto
        .createHash("md5")
        .update(internalId)
        .digest("hex")
        .substring(0, 12);
    } while (context.usedIds.has(newId));

    return newId;
  }

  function setOrUpdateAttribute(
    openingElement: JSXOpeningElement,
    name: string,
    value: string,
  ): void {
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
      openingElement.attributes[existingAttrIndex] = newAttribute;
    } else {
      openingElement.attributes.push(newAttribute);
    }
  }

  function addComponentAttributes(
    openingElement: JSXOpeningElement,
    filename: string,
    componentName: string,
    context: IdGenerationContext,
  ): void {
    setOrUpdateAttribute(openingElement, "data-component-file", filename);
    setOrUpdateAttribute(openingElement, "data-component-name", componentName);
    assignElementId(openingElement, context);
  }

  function addRenderedByAttributes(
    openingElement: JSXOpeningElement,
    filename: string,
    context: IdGenerationContext,
  ): void {
    setOrUpdateAttribute(openingElement, "data-rendered-by", filename);
    assignElementId(openingElement, context);
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

  export type MetadataOptions = {
    filename?: string;
    skipFiles?: string[];
  };

  export function attachMetadata(
    _api: ConfigAPI,
    options: MetadataOptions = {},
  ): PluginObj {
    const filename = options.filename || "";
    const skipFiles = options.skipFiles || [];

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
        FunctionDeclaration(path) {
          const componentName = getComponentName(path);
          if (componentName) {
            processComponent(path, componentName, filename);
          }
        },

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
    const context: IdGenerationContext = {
      filename,
      usedIds: new Set<string>(),
      elementCounter: 0,
      elementPath: [],
    };
    if (path.isFunctionDeclaration()) {
      path.traverse({
        ReturnStatement(returnPath: NodePath<ReturnStatement>) {
          processComponentReturn(returnPath, filename, componentName, context);
        },
      });
    }

    if (path.isVariableDeclarator() && path.node.init) {
      const func = path.node.init;

      if (t.isArrowFunctionExpression(func)) {
        if (t.isJSXElement(func.body)) {
          addEditorMetadata(func.body, filename, componentName, true, context);
          processJSXChildren(func.body, filename, false, context); // Root element: no text wrapping
        } else if (t.isJSXFragment(func.body)) {
          addEditorMetadataToFragmentChildren(
            func.body,
            filename,
            componentName,
            context,
          );
          addRenderedByToFragmentChildren(func.body, filename, context);
        } else if (t.isCallExpression(func.body)) {
          const jsxElement = convertCreateElementToJSX(func.body);
          if (jsxElement) {
            addEditorMetadata(
              jsxElement,
              filename,
              componentName,
              true,
              context,
            );
            processJSXChildren(jsxElement, filename, false, context); // Root element: no text wrapping
            func.body = jsxElement;
          }
        } else if (t.isBlockStatement(func.body)) {
          path.traverse({
            ReturnStatement(returnPath: NodePath<ReturnStatement>) {
              processComponentReturn(
                returnPath,
                filename,
                componentName,
                context,
              );
            },
          });
        }
      }

      if (t.isFunctionExpression(func)) {
        path.traverse({
          ReturnStatement(returnPath: NodePath<ReturnStatement>) {
            processComponentReturn(
              returnPath,
              filename,
              componentName,
              context,
            );
          },
        });
      }
    }
  }

  function processComponentReturn(
    returnPath: NodePath<ReturnStatement>,
    filename: string,
    componentName: string,
    context: IdGenerationContext,
  ): void {
    const argument = returnPath.node.argument;

    if (t.isJSXElement(argument)) {
      addEditorMetadata(argument, filename, componentName, true, context);
      processJSXChildren(argument, filename, false, context); // Root element: no text wrapping
    } else if (t.isJSXFragment(argument)) {
      addEditorMetadataToFragmentChildren(
        argument,
        filename,
        componentName,
        context,
      );
      addRenderedByToFragmentChildren(argument, filename, context);
    } else if (t.isCallExpression(argument)) {
      const jsxElement = convertCreateElementToJSX(argument);
      if (jsxElement) {
        addEditorMetadata(jsxElement, filename, componentName, true, context);
        processJSXChildren(jsxElement, filename, false, context); // Root element: no text wrapping
        returnPath.node.argument = jsxElement;
      }
    }
  }

  function addEditorMetadata(
    jsxElement: JSXElement,
    filename: string,
    componentName: string,
    isRoot = false,
    context: IdGenerationContext,
  ): void {
    if (!filename) return;

    const openingElement: JSXOpeningElement = jsxElement.openingElement;

    if (isRoot) {
      addComponentAttributes(openingElement, filename, componentName, context);
    } else {
      addRenderedByAttributes(openingElement, filename, context);
    }
  }

  function addEditorMetadataToFragmentChildren(
    jsxFragment: JSXFragment,
    filename: string,
    componentName: string,
    context: IdGenerationContext,
  ): void {
    if (!filename || !jsxFragment.children) return;

    jsxFragment.children.forEach((child) => {
      if (t.isJSXElement(child)) {
        addEditorMetadata(child, filename, componentName, true, context);
      }
    });
  }

  function processJSXChildren(
    jsxElement: JSXElement,
    filename: string,
    wrapExpressions = false,
    context: IdGenerationContext,
  ): void {
    if (!jsxElement.children) return;

    const currentTagName = getElementTagName(jsxElement);
    context.elementPath.push(currentTagName);

    const processedChildren: JSXChild[] = [];
    let hasChanges = false;

    jsxElement.children.forEach((child) => {
      if (t.isJSXElement(child)) {
        if (!isReactComponent(child)) {
          addRenderedByAttributes(child.openingElement, filename, context);
          processJSXChildren(child, filename, false, context);
        } else {
          processJSXChildren(child, filename, true, context);
        }
        processedChildren.push(child);
      } else if (t.isJSXText(child)) {
        const textContent = child.value.trim();
        if (textContent && wrapExpressions) {
          const spanOpeningElement = t.jsxOpeningElement(
            t.jsxIdentifier("span"),
            [],
          );
          addRenderedByAttributes(spanOpeningElement, filename, context);

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
          const spanOpeningElement = t.jsxOpeningElement(
            t.jsxIdentifier("span"),
            [],
          );
          addRenderedByAttributes(spanOpeningElement, filename, context);

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

    context.elementPath.pop();

    if (hasChanges) {
      jsxElement.children = processedChildren;
    }
  }

  function addRenderedByToFragmentChildren(
    jsxFragment: JSXFragment,
    filename: string,
    context: IdGenerationContext,
  ): void {
    if (!jsxFragment.children) return;

    jsxFragment.children.forEach((child) => {
      if (t.isJSXElement(child)) {
        processJSXChildren(child, filename, false, context);
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
}

namespace AttachBridge {
  export type BridgeOptions = {
    filename?: string;
    skipFiles?: string[];
  };

  export function attachBridge(
    _api: ConfigAPI,
    options: BridgeOptions = {},
  ): PluginObj {
    const filename = options.filename || "";
    const skipFiles = options.skipFiles || [];

    if (
      skipFiles.some(
        (skipFile) => filename === skipFile || filename.includes(skipFile),
      )
    ) {
      return {
        name: "babel-plugin-jsx-bridge",
        visitor: {},
      };
    }

    return {
      name: "babel-plugin-jsx-bridge",
      visitor: {
        Program(path) {
          let needsWrapper = false;
          path.traverse({
            JSXElement(jsxPath: NodePath<JSXElement>) {
              const jsxElement = jsxPath.node;
              if (
                isHTMLElement(jsxElement) &&
                hasDataEditorId(jsxElement) &&
                !isAlreadyWrapped(jsxPath)
              ) {
                needsWrapper = true;
              }
            },
          });

          if (needsWrapper && !hasExistingBridgeWrapper(path)) {
            addBridgeWrapperCode(path);
          }
        },
        JSXElement(path: NodePath<JSXElement>) {
          const jsxElement = path.node;

          if (
            isHTMLElement(jsxElement) &&
            hasDataEditorId(jsxElement) &&
            !isAlreadyWrapped(path)
          ) {
            wrapWithBridge(path);
          }
        },
      },
    };
  }

  function isHTMLElement(jsxElement: JSXElement): boolean {
    if (t.isJSXIdentifier(jsxElement.openingElement.name)) {
      const tagName = jsxElement.openingElement.name.name;
      return /^[a-z]/.test(tagName);
    }
    return false;
  }

  function hasDataEditorId(jsxElement: JSXElement): boolean {
    return jsxElement.openingElement.attributes.some(
      (attr): attr is JSXAttribute =>
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        attr.name.name === "data-editor-id",
    );
  }

  function isAlreadyWrapped(path: NodePath<JSXElement>): boolean {
    const parent = path.parentPath;
    return !!(
      parent?.isJSXElement() &&
      t.isJSXIdentifier(parent.node.openingElement.name) &&
      parent.node.openingElement.name.name === "BridgeWrapper"
    );
  }

  function wrapWithBridge(path: NodePath<JSXElement>): void {
    const original = path.node;

    const editorIdAttr = original.openingElement.attributes.find(
      (attr): attr is JSXAttribute =>
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        attr.name.name === "data-editor-id",
    );

    if (!editorIdAttr || !t.isStringLiteral(editorIdAttr.value)) return;

    const editorId = editorIdAttr.value.value;

    const cloned = t.cloneNode(original, /* deep */ true) as JSXElement;

    const bridgeElement = t.jsxElement(
      t.jsxOpeningElement(t.jsxIdentifier("BridgeWrapper"), [
        t.jsxAttribute(t.jsxIdentifier("editorId"), t.stringLiteral(editorId)),
        t.jsxAttribute(
          t.jsxIdentifier("originalElement"),
          t.jsxExpressionContainer(
            t.stringLiteral(getBridgeElementTagName(original)),
          ),
        ),
      ]),
      t.jsxClosingElement(t.jsxIdentifier("BridgeWrapper")),
      [cloned],
    );

    path.replaceWith(bridgeElement);
  }

  function getBridgeElementTagName(jsxElement: JSXElement): string {
    if (t.isJSXIdentifier(jsxElement.openingElement.name)) {
      return jsxElement.openingElement.name.name;
    }
    return "div";
  }

  function hasExistingBridgeWrapper(programPath: any): boolean {
    const body = programPath.node.body;
    return body.some(
      (node: any) =>
        t.isFunctionDeclaration(node) &&
        t.isIdentifier(node.id) &&
        node.id.name === "BridgeWrapper",
    );
  }

  function hasExistingReactImport(programPath: any): boolean {
    const body = programPath.node.body;
    return body.some(
      (node: any) =>
        t.isImportDeclaration(node) &&
        t.isStringLiteral(node.source) &&
        node.source.value === "react",
    );
  }

  function addBridgeWrapperCode(programPath: any): void {
    const needsReactImport = !hasExistingReactImport(programPath);

    const bridgeWrapperCode = `${needsReactImport ? 'import React from "react";' : ""}

function BridgeWrapper({ editorId, children }) {
  const [overrides, setOverrides] = React.useState({});

  React.useEffect(() => {
    const handleMessage = (event) => {
      if (
        event.data?.type === "ELEMENT_UPDATE" &&
        event.data?.editorId === editorId
      ) {
        setOverrides(event.data.overrides || {});
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }
  }, [editorId]);

  if (React.Children.count(children) !== 1) {
    return React.createElement(React.Fragment, null, children);
  }

  const onlyChild = React.Children.only(children);

  if (!React.isValidElement(onlyChild)) {
    return React.createElement(React.Fragment, null, onlyChild);
  }

  const mergedProps = {
    ...(onlyChild.props ?? {}),
    ...(overrides.attributes ?? {}),
  };

  const finalChildren = overrides.children !== undefined
    ? overrides.children
    : onlyChild.props.children ?? null;

  return React.cloneElement(onlyChild, mergedProps, finalChildren);
}

`;

    const ast = parse(bridgeWrapperCode, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    if (ast?.program?.body && Array.isArray(ast.program.body)) {
      // Add nodes in reverse order since unshiftContainer adds to the beginning
      for (let i = ast.program.body.length - 1; i >= 0; i--) {
        programPath.unshiftContainer("body", ast.program.body[i]);
      }
    }
  }
}

export const attachMetadata = AttachMetadata.attachMetadata;
export const attachBridge = AttachBridge.attachBridge;
export type MetadataOptions = AttachMetadata.MetadataOptions;
export type BridgeOptions = AttachBridge.BridgeOptions;
