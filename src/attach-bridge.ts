import type { ConfigAPI } from "@babel/core";
import type { NodePath } from "@babel/traverse";
import { type PluginObj, types as t } from "@babel/core";
import type { JSXElement, JSXAttribute } from "@babel/types";

export type BridgeOptions = {
  filename?: string;
  skipFiles?: string[];
};

function attachBridgePlugin(
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

  // Clone to prevent circular AST references
  const cloned = t.cloneNode(original, /* deep */ true) as JSXElement;

  // Remove the data-editor-id attribute so it won't be rewrapped
  cloned.openingElement.attributes = cloned.openingElement.attributes.filter(
    (attr) =>
      !(
        t.isJSXAttribute(attr) &&
        t.isJSXIdentifier(attr.name) &&
        attr.name.name === "data-editor-id"
      ),
  );

  const bridgeElement = t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier("BridgeWrapper"), [
      t.jsxAttribute(t.jsxIdentifier("editorId"), t.stringLiteral(editorId)),
      t.jsxAttribute(
        t.jsxIdentifier("originalElement"),
        t.jsxExpressionContainer(t.stringLiteral(getElementTagName(original))),
      ),
    ]),
    t.jsxClosingElement(t.jsxIdentifier("BridgeWrapper")),
    [cloned],
  );

  path.replaceWith(bridgeElement);
}

function getElementTagName(jsxElement: JSXElement): string {
  if (t.isJSXIdentifier(jsxElement.openingElement.name)) {
    return jsxElement.openingElement.name.name;
  }
  return "div";
}

export default attachBridgePlugin;
