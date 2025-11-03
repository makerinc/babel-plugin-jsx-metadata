import type { ConfigAPI } from "@babel/core";
import type { NodePath } from "@babel/traverse";
import { type PluginObj, types as t } from "@babel/core";
import type { JSXAttribute, JSXElement } from "@babel/types";

export type BridgeOptions = {
  filename?: string;
  skipFiles?: string[];
  debugger?: boolean;
  messageType?: string;
  componentPath?: string;
};

export function attachBridge(
  _api: ConfigAPI,
  options: BridgeOptions,
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
        if (
          options.componentPath &&
          !hasExistingLivePreviewBridgeImport(path)
        ) {
          addLivePreviewBridgeImport(path, options.componentPath);
        }
      },
      JSXElement(path: NodePath<JSXElement>) {
        const jsxElement = path.node;
        const bridgeInfo = processJSXElementForBridge(jsxElement, path);

        if (bridgeInfo.shouldWrap) {
          wrapWithBridge(path, options, bridgeInfo.editorId);
        }
      },
    },
  };
}

function processJSXElementForBridge(
  jsxElement: JSXElement,
  path: NodePath<JSXElement>,
): {
  shouldWrap: boolean;
  editorId: string | null;
} {
  if (!t.isJSXIdentifier(jsxElement.openingElement.name)) {
    return { shouldWrap: false, editorId: null };
  }

  const tagName = jsxElement.openingElement.name.name;
  const firstChar = tagName.charCodeAt(0);
  const isHTML = firstChar >= 97 && firstChar <= 122;

  if (!isHTML) {
    return { shouldWrap: false, editorId: null };
  }

  const parent = path.parentPath;
  const isAlreadyWrapped = !!(
    parent?.isJSXElement() &&
    t.isJSXIdentifier(parent.node.openingElement.name) &&
    parent.node.openingElement.name.name === "LivePreviewBridge"
  );

  if (isAlreadyWrapped) {
    return { shouldWrap: false, editorId: null };
  }

  const editorIdAttr = jsxElement.openingElement.attributes.find(
    (attr): attr is JSXAttribute =>
      t.isJSXAttribute(attr) &&
      t.isJSXIdentifier(attr.name) &&
      attr.name.name === "data-editor-id",
  );

  const editorId =
    editorIdAttr && t.isStringLiteral(editorIdAttr.value)
      ? editorIdAttr.value.value
      : null;

  return { shouldWrap: !!editorId, editorId };
}

function wrapWithBridge(
  path: NodePath<JSXElement>,
  options: BridgeOptions,
  editorId: string | null,
): void {
  if (!editorId) return;

  const original = path.node;
  const debug = !!options.debugger;
  const messageType = options.messageType || "ELEMENT_UPDATE";
  const cloned = t.cloneNode(original, /* deep */ true) as JSXElement;

  const attributes = [
    t.jsxAttribute(t.jsxIdentifier("editorId"), t.stringLiteral(editorId)),
    t.jsxAttribute(
      t.jsxIdentifier("messageType"),
      t.stringLiteral(messageType),
    ),
  ];

  if (debug) {
    attributes.push(
      t.jsxAttribute(
        t.jsxIdentifier("debug"),
        t.jsxExpressionContainer(t.booleanLiteral(true)),
      ),
    );
  }

  const bridgeElement = t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier("LivePreviewBridge"), attributes),
    t.jsxClosingElement(t.jsxIdentifier("LivePreviewBridge")),
    [cloned],
  );

  path.replaceWith(bridgeElement);
}

function hasExistingLivePreviewBridgeImport(
  programPath: NodePath<t.Program>,
): boolean {
  const body = programPath.node.body;
  return body.some(
    (node: t.Statement) =>
      t.isImportDeclaration(node) &&
      node.specifiers.some(
        (spec) =>
          t.isImportDefaultSpecifier(spec) &&
          spec.local.name === "LivePreviewBridge",
      ),
  );
}

function addLivePreviewBridgeImport(
  programPath: NodePath<t.Program>,
  componentPath: string,
) {
  const importDeclaration = t.importDeclaration(
    [t.importDefaultSpecifier(t.identifier("LivePreviewBridge"))],
    t.stringLiteral(componentPath),
  );

  programPath.unshiftContainer("body", importDeclaration);
}
