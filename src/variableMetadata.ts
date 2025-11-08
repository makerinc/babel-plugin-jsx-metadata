import { types as t } from "@babel/core";
import type { Binding, NodePath } from "@babel/traverse";
import type {
  ArrowFunctionExpression,
  Expression,
  FunctionExpression,
  JSXElement,
  SpreadElement,
} from "@babel/types";
import {
  buildLocationAttributeValue,
  extractPropertyAccess,
  unwrapExpressionPath,
  type PropertyAccess,
} from "./propertyAccess";
import type { LoopHelpers } from "./loopMetadata";

type VariableMetadataParams<Context> = {
  functionLikePath: NodePath<
    ArrowFunctionExpression | FunctionExpression | t.FunctionDeclaration
  >;
  filename: string;
  context: Context;
  helpers: LoopHelpers<Context>;
};

export function attachVariableMetadata<Context>(
  params: VariableMetadataParams<Context>,
): void {
  const { functionLikePath, filename, helpers } = params;

  if (!filename) return;

  functionLikePath.traverse({
    Function(innerFnPath) {
      innerFnPath.skip();
    },
    ArrowFunctionExpression(innerArrowPath) {
      innerArrowPath.skip();
    },
    JSXElement(elementPath: NodePath<JSXElement>) {
      processElement(elementPath, filename, helpers);
    },
  });
}

function processElement<Context>(
  elementPath: NodePath<JSXElement>,
  filename: string,
  helpers: LoopHelpers<Context>,
): void {
  annotateChildrenSource(elementPath, filename, helpers);
  annotateImgSource(elementPath, filename, helpers);
}

function annotateChildrenSource<Context>(
  elementPath: NodePath<JSXElement>,
  filename: string,
  helpers: LoopHelpers<Context>,
): void {
  if (helpers.isReactComponent(elementPath.node)) return;

  const childPaths = elementPath.get("children") as NodePath[];

  for (const childPath of childPaths) {
    if (Array.isArray(childPath)) continue;
    if (!childPath.isJSXExpressionContainer()) continue;

    const expressionPath = childPath.get("expression");
    if (!expressionPath?.node || !t.isExpression(expressionPath.node)) {
      continue;
    }

    const access = extractPropertyAccess(expressionPath.node);
    if (!access) continue;

    const elementPaths = resolveBindingElementPaths(
      expressionPath as NodePath<Expression>,
      access,
    );
    if (!elementPaths) continue;

    const value = buildLocationAttributeValue({
      filename,
      elementPaths,
      segments: access.segments,
      baseName: access.baseName,
    });

    if (!value) continue;

    helpers.setOrUpdateAttribute(
      elementPath.node.openingElement,
      "data-children-source",
      value,
    );
    return;
  }
}

function annotateImgSource<Context>(
  elementPath: NodePath<JSXElement>,
  filename: string,
  helpers: LoopHelpers<Context>,
): void {
  const openingElement = elementPath.node.openingElement;
  if (!t.isJSXIdentifier(openingElement.name)) return;
  if (openingElement.name.name !== "img") return;

  const attributePaths = elementPath
    .get("openingElement")
    .get("attributes") as NodePath[];

  for (const attrPath of attributePaths) {
    if (!attrPath.isJSXAttribute()) continue;
    const namePath = attrPath.get("name");
    if (!namePath.isJSXIdentifier({ name: "src" })) continue;

    const valuePath = attrPath.get("value");
    if (!valuePath || !valuePath.isJSXExpressionContainer()) continue;

    const expressionPath = valuePath.get("expression");
    if (!expressionPath?.node || !t.isExpression(expressionPath.node)) {
      continue;
    }

    const access = extractPropertyAccess(expressionPath.node);
    if (!access) continue;

    const elementPaths = resolveBindingElementPaths(
      expressionPath as NodePath<Expression>,
      access,
    );
    if (!elementPaths) continue;

    const sourceValue = buildLocationAttributeValue({
      filename,
      elementPaths,
      segments: access.segments,
      baseName: access.baseName,
    });

    if (!sourceValue) continue;

    helpers.setOrUpdateAttribute(
      openingElement,
      "data-img-source",
      sourceValue,
    );
    return;
  }
}

function resolveBindingElementPaths(
  expressionPath: NodePath<Expression>,
  access: PropertyAccess,
): NodePath<Expression | SpreadElement | null>[] | null {
  const binding = expressionPath.scope.getBinding(access.baseName);
  if (!binding) return null;
  if (binding.constantViolations.length > 0) return null;

  const initPaths = getBindingInitializerPaths(binding);
  if (!initPaths) return null;

  return initPaths;
}

function getBindingInitializerPaths(
  binding: Binding,
): NodePath<Expression | SpreadElement | null>[] | null {
  const bindingPath = binding.path;
  if (!bindingPath.isVariableDeclarator()) return null;

  const initPath = bindingPath.get("init");
  if (!initPath || Array.isArray(initPath)) return null;

  const unwrappedInit = unwrapExpressionPath(initPath as NodePath);
  if (!unwrappedInit) return null;

  if (!unwrappedInit.isExpression()) return null;

  return [unwrappedInit as NodePath<Expression>];
}
