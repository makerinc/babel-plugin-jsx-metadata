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
      JSXElement(path: NodePath) {
        const jsxElement = path.node as JSXElement;

        if (isHTMLElement(jsxElement) && hasDataEditorId(jsxElement)) {
          wrapWithBridge(path as NodePath<JSXElement>);
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

function wrapWithBridge(path: NodePath<JSXElement>): void {
  const originalElement = path.node;

  const editorIdAttr = originalElement.openingElement.attributes.find(
    (attr): attr is JSXAttribute =>
      t.isJSXAttribute(attr) &&
      t.isJSXIdentifier(attr.name) &&
      attr.name.name === "data-editor-id",
  );

  if (!editorIdAttr || !t.isStringLiteral(editorIdAttr.value)) {
    return;
  }

  const editorId = editorIdAttr.value.value;

  const bridgeElement = t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier("BridgeWrapper"), [
      t.jsxAttribute(t.jsxIdentifier("editorId"), t.stringLiteral(editorId)),
      t.jsxAttribute(
        t.jsxIdentifier("originalElement"),
        t.jsxExpressionContainer(
          t.stringLiteral(getElementTagName(originalElement)),
        ),
      ),
    ]),
    t.jsxClosingElement(t.jsxIdentifier("BridgeWrapper")),
    [originalElement],
  );

  path.replaceWith(bridgeElement);
}

function getElementTagName(jsxElement: JSXElement): string {
  if (t.isJSXIdentifier(jsxElement.openingElement.name)) {
    return jsxElement.openingElement.name.name;
  }
  return "div";
}

const BridgeWrapperComponent = `
import React, { useState, useEffect, cloneElement } from 'react';

const BridgeWrapper = ({ editorId, originalElement, children }) => {
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'ELEMENT_UPDATE' && event.data?.editorId === editorId) {
        setOverrides(event.data.overrides || {});
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [editorId]);

  if (React.Children.count(children) !== 1) {
    return children;
  }

  const child = React.Children.only(children);

  if (!React.isValidElement(child)) {
    return child;
  }

  const mergedProps = {
    ...child.props,
    ...overrides.attributes,
  };

  const finalChildren = overrides.children !== undefined
    ? overrides.children
    : child.props.children;

  return cloneElement(child, mergedProps, finalChildren);
};

export default BridgeWrapper;
`;

export { BridgeWrapperComponent };
export default attachBridgePlugin;
