import type { ConfigAPI } from "@babel/core";
import { type PluginObj, types as t } from "@babel/core";

export type DetachOptions = {
  filename?: string;
  skipFiles?: string[];
};

export function detachMetadata(
  _api: ConfigAPI,
  options: DetachOptions = {},
): PluginObj {
  const filename = options.filename || "";
  const skipFiles = options.skipFiles || [];

  if (
    skipFiles.some(
      (skipFile) => filename === skipFile || filename.includes(skipFile),
    )
  ) {
    return {
      name: "babel-plugin-jsx-detach-metadata",
      visitor: {},
    };
  }

  return {
    name: "babel-plugin-jsx-detach-metadata",
    visitor: {
      JSXOpeningElement(path) {
        const openingElement = path.node;
        const attrs = openingElement.attributes;

        for (let i = attrs.length - 1; i >= 0; i--) {
          const attr = attrs[i];
          if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
            const attrName = attr.name.name;
            if (
              attrName === "data-editor-id" ||
              attrName === "data-component-file" ||
              attrName === "data-component-name" ||
              attrName === "data-rendered-by"
            ) {
              attrs.splice(i, 1);
            }
          }
        }
      },
    },
  };
}
