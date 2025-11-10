import { types as t } from "@babel/core";
import type { NodePath } from "@babel/traverse";
import {
  type AttributeValue,
  buildLocationAttributeValue,
  extractPropertyAccess,
  unwrapExpressionPath,
  buildLoopAccessorSegments,
  type PropertyAccessSegment,
} from "./propertyAccess";
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  FunctionExpression,
  JSXElement,
  JSXOpeningElement,
  LVal,
  SpreadElement,
  TSParameterProperty,
} from "@babel/types";

export type LoopHelpers<Context> = {
  processJSXChildren: (
    element: JSXElement,
    filename: string,
    wrapExpressions: boolean,
    context: Context,
  ) => void;
  addRenderedByAttributes: (
    openingElement: JSXOpeningElement,
    filename: string,
    context: Context,
  ) => void;
  setOrUpdateAttribute: (
    openingElement: JSXOpeningElement,
    name: string,
    value: AttributeValue,
  ) => void;
  isReactComponent: (element: JSXElement) => boolean;
};

type CollectionSourceInfo = {
  sourceName: string;
  elementPaths: NodePath<Expression | SpreadElement | null>[];
};

type LoopContext<Context> = {
  indexExpression: Expression | null;
  indexParamName: string | null;
  itemParamNames: Set<string>;
  collectionInfo: CollectionSourceInfo | null;
  helpers: LoopHelpers<Context>;
  filename: string;
  context: Context;
};

const processedLoopElements = new WeakSet<JSXElement>();

export function attachLoopMetadata<Context>(params: {
  functionLikePath: NodePath<
    ArrowFunctionExpression | FunctionExpression | t.FunctionDeclaration
  >;
  filename: string;
  context: Context;
  helpers: LoopHelpers<Context>;
}): void {
  const { functionLikePath, filename, context, helpers } = params;

  functionLikePath.traverse({
    CallExpression(callPath: NodePath<CallExpression>) {
      processCollectionRenderingCall(callPath, filename, context, helpers);
    },
  });
}

function processCollectionRenderingCall<Context>(
  callPath: NodePath<CallExpression>,
  filename: string,
  context: Context,
  helpers: LoopHelpers<Context>,
): void {
  if (!filename) return;

  if (!callPath.findParent((parent) => parent.isJSXExpressionContainer())) {
    return;
  }

  const calleePath = callPath.get("callee");
  if (!calleePath.isMemberExpression()) return;

  const propertyPath = calleePath.get("property");
  if (!propertyPath.isIdentifier({ name: "map" })) return;

  const sourceObjectPath = calleePath.get("object");
  if (!sourceObjectPath.isIdentifier()) return;

  const collectionInfo = resolveCollectionSourceInfo(sourceObjectPath);

  const callbackArgPath = callPath.get("arguments")[0];
  if (
    !callbackArgPath ||
    (!callbackArgPath.isArrowFunctionExpression() &&
      !callbackArgPath.isFunctionExpression())
  ) {
    return;
  }

  const functionParent = callPath.getFunctionParent();
  if (
    functionParent &&
    functionParent.node !== callbackArgPath.node &&
    !callbackArgPath.findParent((parent) => parent === functionParent)
  ) {
    // Ensure we only process callbacks defined in the same scope as the component
  }

  const returnedElements = getReturnedJSXElements(callbackArgPath);
  if (returnedElements.length === 0) return;

  const itemParamNames = collectItemParamNames(callbackArgPath);
  if (itemParamNames.size === 0) return;

  const indexExpression = getIndexParamExpression(callbackArgPath);

  for (const elementPath of returnedElements) {
    if (!elementPath.isJSXElement()) continue;
    processLoopElement(
      elementPath,
      filename,
      context,
      collectionInfo,
      itemParamNames,
      indexExpression,
      callbackArgPath,
      helpers,
    );
  }
}

function resolveCollectionSourceInfo(
  sourceIdentifierPath: NodePath<t.Identifier>,
): CollectionSourceInfo | null {
  const binding = sourceIdentifierPath.scope.getBinding(
    sourceIdentifierPath.node.name,
  );

  if (!binding) return null;
  if (binding.kind === "module") return null;
  if (!binding.path.isVariableDeclarator()) return null;

  const initPath = binding.path.get("init");
  if (!initPath) return null;

  const unwrappedInitPath = unwrapExpressionPath(initPath as NodePath);
  if (!unwrappedInitPath || !unwrappedInitPath.isArrayExpression()) {
    return null;
  }

  const elementPaths = unwrappedInitPath.get("elements") as NodePath<
    Expression | SpreadElement | null
  >[];

  return {
    sourceName: sourceIdentifierPath.node.name,
    elementPaths,
  };
}

function getReturnedJSXElements(
  callbackPath: NodePath<ArrowFunctionExpression | FunctionExpression>,
): NodePath<JSXElement>[] {
  const elements: NodePath<JSXElement>[] = [];
  const bodyPath = callbackPath.get("body");

  if (bodyPath.isJSXElement()) {
    elements.push(bodyPath as NodePath<JSXElement>);
    return elements;
  }

  if (bodyPath.isJSXFragment()) {
    const children = bodyPath.get("children");
    for (const childPath of children) {
      if (Array.isArray(childPath)) continue;
      if (childPath.isJSXElement()) {
        elements.push(childPath);
      }
    }
    return elements;
  }

  if (bodyPath.isBlockStatement()) {
    bodyPath.traverse({
      ReturnStatement(returnPath) {
        const argumentPath = returnPath.get("argument");
        if (!argumentPath) return;

        if (argumentPath.isJSXElement()) {
          elements.push(argumentPath as NodePath<JSXElement>);
        } else if (argumentPath.isJSXFragment()) {
          const fragmentChildren = argumentPath.get("children");
          for (const fragmentChild of fragmentChildren) {
            if (Array.isArray(fragmentChild)) continue;
            if (fragmentChild.isJSXElement()) {
              elements.push(fragmentChild);
            }
          }
        }
      },
      Function(innerFnPath) {
        innerFnPath.skip();
      },
      ArrowFunctionExpression(innerArrowPath) {
        innerArrowPath.skip();
      },
    });
  }

  return elements;
}

function collectItemParamNames(
  callbackPath: NodePath<ArrowFunctionExpression | FunctionExpression>,
): Set<string> {
  const names = new Set<string>();
  if (callbackPath.node.params.length === 0) {
    return names;
  }

  const firstParam = callbackPath.node.params[0];
  if (!firstParam) return names;

  collectNamesFromFunctionParameter(firstParam, names);
  return names;
}

function collectNamesFromFunctionParameter(
  param: t.FunctionParameter,
  names: Set<string>,
): void {
  if (t.isTSParameterProperty(param)) {
    collectNamesFromFunctionParameter(
      (param as TSParameterProperty).parameter,
      names,
    );
    return;
  }

  if (t.isIdentifier(param)) {
    collectNamesFromPattern(param, names);
    return;
  }

  if (t.isObjectPattern(param) || t.isArrayPattern(param)) {
    collectNamesFromPattern(param, names);
    return;
  }

  if (t.isAssignmentPattern(param)) {
    collectNamesFromPattern(param.left as LVal, names);
    return;
  }

  if (t.isRestElement(param)) {
    const argument = param.argument;
    if (
      t.isIdentifier(argument) ||
      t.isArrayPattern(argument) ||
      t.isObjectPattern(argument)
    ) {
      collectNamesFromPattern(argument as LVal, names);
    }
  }
}

function collectNamesFromPattern(param: LVal, names: Set<string>): void {
  if (t.isIdentifier(param)) {
    names.add(param.name);
    return;
  }

  if (t.isAssignmentPattern(param)) {
    collectNamesFromPattern(param.left as LVal, names);
    return;
  }

  if (t.isRestElement(param)) {
    collectNamesFromPattern(param.argument as LVal, names);
    return;
  }

  if (t.isObjectPattern(param)) {
    for (const prop of param.properties) {
      if (t.isObjectProperty(prop)) {
        collectNamesFromPattern(prop.value as LVal, names);
      } else if (t.isRestElement(prop)) {
        collectNamesFromPattern(prop.argument as LVal, names);
      }
    }
    return;
  }

  if (t.isArrayPattern(param)) {
    for (const element of param.elements) {
      if (!element) continue;
      if (t.isRestElement(element)) {
        collectNamesFromPattern(element.argument as LVal, names);
      } else {
        collectNamesFromPattern(element as LVal, names);
      }
    }
  }
}

function getIndexParamExpression(
  callbackPath: NodePath<ArrowFunctionExpression | FunctionExpression>,
): Expression | null {
  if (callbackPath.node.params.length < 2) return null;
  const indexParam = callbackPath.node.params[1];
  if (!indexParam) return null;

  if (t.isIdentifier(indexParam)) {
    return t.identifier(indexParam.name);
  }

  if (t.isAssignmentPattern(indexParam) && t.isIdentifier(indexParam.left)) {
    return t.identifier(indexParam.left.name);
  }

  return null;
}

function getIndexParamName(
  callbackPath: NodePath<ArrowFunctionExpression | FunctionExpression>,
): string | null {
  if (callbackPath.node.params.length < 2) return null;
  const indexParam = callbackPath.node.params[1];
  if (!indexParam) return null;

  if (t.isIdentifier(indexParam)) {
    return indexParam.name;
  }

  if (t.isAssignmentPattern(indexParam) && t.isIdentifier(indexParam.left)) {
    return indexParam.left.name;
  }

  return null;
}

function processLoopElement<Context>(
  elementPath: NodePath<JSXElement>,
  filename: string,
  context: Context,
  collectionInfo: CollectionSourceInfo | null,
  itemParamNames: Set<string>,
  indexExpression: Expression | null,
  callbackArgPath: NodePath<ArrowFunctionExpression | FunctionExpression>,
  helpers: LoopHelpers<Context>,
): void {
  if (processedLoopElements.has(elementPath.node)) return;
  if (!elementReferencesParamNames(elementPath, itemParamNames)) return;

  processedLoopElements.add(elementPath.node);

  helpers.addRenderedByAttributes(
    elementPath.node.openingElement,
    filename,
    context,
  );

  helpers.processJSXChildren(elementPath.node, filename, false, context);

  const loopContext: LoopContext<Context> = {
    indexExpression: indexExpression
      ? t.cloneNode(indexExpression, true)
      : null,
    indexParamName: getIndexParamName(callbackArgPath),
    itemParamNames,
    collectionInfo,
    helpers,
    filename,
    context,
  };

  applyLoopAnnotations(elementPath, loopContext);
}

function applyLoopAnnotations<Context>(
  elementPath: NodePath<JSXElement>,
  loopContext: LoopContext<Context>,
): void {
  const { helpers } = loopContext;

  const annotateElement = (currentPath: NodePath<JSXElement>): void => {
    if (
      processedLoopElements.has(currentPath.node) &&
      currentPath.node !== elementPath.node
    ) {
      return;
    }

    if (helpers.isReactComponent(currentPath.node)) return;

    if (!elementReferencesParamNames(currentPath, loopContext.itemParamNames)) {
      return;
    }

    annotateDynamicChildrenForElement(currentPath, loopContext);
    annotateImgSource(currentPath, loopContext);
  };

  annotateElement(elementPath);

  elementPath.traverse({
    JSXElement(innerPath) {
      annotateElement(innerPath);
    },
  });
}

function elementReferencesParamNames(
  elementPath: NodePath<JSXElement>,
  names: Set<string>,
): boolean {
  if (names.size === 0) return false;

  let found = false;

  elementPath.traverse({
    Identifier(identifierPath) {
      if (found) {
        identifierPath.stop();
        return;
      }
      if (!identifierPath.isReferencedIdentifier()) return;

      if (names.has(identifierPath.node.name)) {
        found = true;
        identifierPath.stop();
      }
    },
    JSXIdentifier() {
      // ignore
    },
    Function(innerFnPath) {
      innerFnPath.skip();
    },
    ArrowFunctionExpression(innerArrowPath) {
      innerArrowPath.skip();
    },
  });

  return found;
}

function annotateDynamicChildrenForElement<Context>(
  elementPath: NodePath<JSXElement>,
  loopContext: LoopContext<Context>,
): void {
  const { helpers, filename, collectionInfo } = loopContext;

  if (helpers.isReactComponent(elementPath.node)) return;
  if (!collectionInfo) return;

  const dynamicChildInfo = getDynamicChildInfo(
    elementPath,
    loopContext.itemParamNames,
  );

  if (!dynamicChildInfo) return;

  const segments = loopContext.indexParamName
    ? buildLoopAccessorSegments(
        dynamicChildInfo.segments,
        loopContext.indexParamName,
      )
    : dynamicChildInfo.segments;

  const value = buildLocationAttributeValue({
    filename,
    elementPaths: collectionInfo.elementPaths,
    segments,
    indexExpression: loopContext.indexExpression ?? undefined,
    baseName: collectionInfo.sourceName,
  });

  if (value) {
    helpers.setOrUpdateAttribute(
      elementPath.node.openingElement,
      "data-children-source",
      value,
    );
  }
}

function annotateImgSource<Context>(
  elementPath: NodePath<JSXElement>,
  loopContext: LoopContext<Context>,
): void {
  const { collectionInfo, indexExpression, helpers } = loopContext;
  if (!collectionInfo) return;

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
    if (!loopContext.itemParamNames.has(access.baseName)) continue;

    const segments = loopContext.indexParamName 
      ? buildLoopAccessorSegments(access.segments, loopContext.indexParamName)
      : access.segments;

    const sourceValue = buildLocationAttributeValue({
      filename: loopContext.filename,
      elementPaths: collectionInfo.elementPaths,
      segments,
      indexExpression: indexExpression ?? undefined,
      baseName: collectionInfo.sourceName,
    });

    if (sourceValue) {
      helpers.setOrUpdateAttribute(
        openingElement,
        "data-img-source",
        sourceValue,
      );
    }
  }
}

function getDynamicChildInfo(
  elementPath: NodePath<JSXElement>,
  itemParamNames: Set<string>,
): { segments: PropertyAccessSegment[] } | null {
  const childPaths = elementPath.get("children") as NodePath[];
  let matchedSegments: PropertyAccessSegment[] | null = null;
  let referenceCount = 0;

  for (const childPath of childPaths) {
    if (Array.isArray(childPath)) continue;
    if (!childPath.isJSXExpressionContainer()) continue;

    const expressionPath = childPath.get("expression");
    if (!expressionPath?.node || !t.isExpression(expressionPath.node)) {
      continue;
    }

    const access = extractPropertyAccess(expressionPath.node);
    if (!access) continue;
    if (!itemParamNames.has(access.baseName)) continue;

    referenceCount += 1;
    if (referenceCount > 1) {
      return null;
    }
    matchedSegments = access.segments;
  }

  if (referenceCount === 1 && matchedSegments) {
    return { segments: matchedSegments };
  }

  return null;
}
