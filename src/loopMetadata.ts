import { types as t } from "@babel/core";
import type { NodePath } from "@babel/traverse";
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  FunctionExpression,
  JSXElement,
  JSXOpeningElement,
  LVal,
  OptionalMemberExpression,
  PrivateName,
  SpreadElement,
  TSParameterProperty,
} from "@babel/types";

type AttributeValue =
  | string
  | Expression
  | t.StringLiteral
  | t.JSXExpressionContainer;

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
  itemParamNames: Set<string>;
  collectionInfo: CollectionSourceInfo;
  helpers: LoopHelpers<Context>;
  filename: string;
  context: Context;
};

type PropertyAccessSegment =
  | { kind: "property"; name: string }
  | { kind: "index"; index: number };

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
  if (!collectionInfo) return;

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

function unwrapExpressionPath(path: NodePath): NodePath<Expression> | null {
  if (path.isExpression()) {
    return path as NodePath<Expression>;
  }

  if (
    path.isTSAsExpression() ||
    path.isTypeCastExpression() ||
    path.isTSTypeAssertion()
  ) {
    const expressionPath = path.get("expression");
    if (Array.isArray(expressionPath)) return null;
    return unwrapExpressionPath(expressionPath as NodePath);
  }

  if (path.isParenthesizedExpression()) {
    const expressionPath = path.get("expression");
    if (Array.isArray(expressionPath)) return null;
    return unwrapExpressionPath(expressionPath as NodePath);
  }

  return null;
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

function processLoopElement<Context>(
  elementPath: NodePath<JSXElement>,
  filename: string,
  context: Context,
  collectionInfo: CollectionSourceInfo,
  itemParamNames: Set<string>,
  indexExpression: Expression | null,
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
  const { helpers, filename } = loopContext;

  if (helpers.isReactComponent(elementPath.node)) return;

  const dynamicChildInfo = getDynamicChildInfo(
    elementPath,
    loopContext.itemParamNames,
  );

  if (!dynamicChildInfo) return;

  const value = buildCollectionLocationAttributeValue(
    filename,
    loopContext.collectionInfo,
    loopContext.indexExpression,
    dynamicChildInfo.segments,
  );

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

    if (
      !expressionReferencesNames(
        expressionPath as NodePath<Expression>,
        loopContext.itemParamNames,
      )
    ) {
      continue;
    }

    const propertySegments = extractPropertySegments(
      expressionPath.node,
      loopContext.itemParamNames,
    );

    if (!propertySegments) continue;

    const sourceValue = buildCollectionLocationAttributeValue(
      loopContext.filename,
      collectionInfo,
      indexExpression,
      propertySegments,
    );

    if (sourceValue) {
      helpers.setOrUpdateAttribute(
        openingElement,
        "data-img-source",
        sourceValue,
      );
    }
  }
}

function expressionReferencesNames(
  expressionPath: NodePath<Expression>,
  itemParamNames: Set<string>,
): boolean {
  if (itemParamNames.size === 0) return false;

  let found = false;

  expressionPath.traverse({
    Identifier(identifierPath) {
      if (found) {
        identifierPath.stop();
        return;
      }
      if (!identifierPath.isReferencedIdentifier()) return;

      if (itemParamNames.has(identifierPath.node.name)) {
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

function getDynamicChildInfo(
  elementPath: NodePath<JSXElement>,
  itemParamNames: Set<string>,
): { segments: PropertyAccessSegment[] } | null {
  const childPaths = elementPath.get("children") as NodePath[];

  for (const childPath of childPaths) {
    if (Array.isArray(childPath)) continue;
    if (!childPath.isJSXExpressionContainer()) continue;

    const expressionPath = childPath.get("expression");
    if (!expressionPath?.node || !t.isExpression(expressionPath.node)) {
      continue;
    }

    if (
      !expressionReferencesNames(
        expressionPath as NodePath<Expression>,
        itemParamNames,
      )
    ) {
      continue;
    }

    const segments = extractPropertySegments(
      expressionPath.node,
      itemParamNames,
    );

    if (!segments) return null;

    return { segments };
  }

  return null;
}

function extractPropertySegments(
  expression: Expression,
  itemParamNames: Set<string>,
): PropertyAccessSegment[] | null {
  const unwrapped = unwrapExpression(expression);
  return buildPropertySegmentsFromExpression(unwrapped, itemParamNames);
}

function unwrapExpression(expression: Expression): Expression {
  if (t.isTSAsExpression(expression) || t.isTypeCastExpression(expression)) {
    return unwrapExpression(expression.expression as Expression);
  }
  if (t.isTSTypeAssertion(expression)) {
    return unwrapExpression(expression.expression as Expression);
  }
  if (t.isParenthesizedExpression(expression)) {
    return unwrapExpression(expression.expression as Expression);
  }
  return expression;
}

function buildPropertySegmentsFromExpression(
  expression: Expression,
  itemParamNames: Set<string>,
): PropertyAccessSegment[] | null {
  if (t.isIdentifier(expression)) {
    return itemParamNames.has(expression.name) ? [] : null;
  }

  if (t.isMemberExpression(expression) && !expression.optional) {
    if (!t.isExpression(expression.object)) return null;
    const baseSegments = buildPropertySegmentsFromExpression(
      expression.object as Expression,
      itemParamNames,
    );
    if (!baseSegments) return null;

    const segment = getPropertyAccessSegment(
      expression.property,
      expression.computed,
    );
    if (!segment) return null;

    return [...baseSegments, segment];
  }

  if (t.isOptionalMemberExpression(expression)) {
    if (!t.isExpression(expression.object)) return null;
    const baseSegments = buildPropertySegmentsFromExpression(
      (expression as OptionalMemberExpression).object as Expression,
      itemParamNames,
    );
    if (!baseSegments) return null;

    const segment = getPropertyAccessSegment(
      expression.property,
      expression.computed,
    );
    if (!segment) return null;

    return [...baseSegments, segment];
  }

  return null;
}

function getPropertyAccessSegment(
  property: Expression | PrivateName,
  computed: boolean,
): PropertyAccessSegment | null {
  if (t.isPrivateName(property)) return null;

  if (!computed) {
    if (t.isIdentifier(property)) {
      return { kind: "property", name: property.name };
    }
    if (t.isStringLiteral(property)) {
      return { kind: "property", name: property.value };
    }
  }

  if (t.isStringLiteral(property)) {
    return { kind: "property", name: property.value };
  }

  if (t.isNumericLiteral(property)) {
    return { kind: "index", index: property.value };
  }

  return null;
}

function buildCollectionLocationAttributeValue(
  filename: string,
  collectionInfo: CollectionSourceInfo,
  indexExpression: Expression | null,
  segments: PropertyAccessSegment[],
): AttributeValue | null {
  const locations = collectionInfo.elementPaths.map((elementPath) =>
    getLocationForSegments(filename, elementPath, segments),
  );

  const availableLocations = locations.filter((loc): loc is string => !!loc);
  if (availableLocations.length === 0) {
    return null;
  }

  if (!indexExpression) {
    if (availableLocations.length === 1) {
      return availableLocations[0];
    }
    return null;
  }

  if (collectionInfo.elementPaths.length === 1) {
    return availableLocations[0] ?? null;
  }

  const locationElements = locations.map((loc) =>
    loc ? t.stringLiteral(loc) : t.nullLiteral(),
  );

  const locationArrayExpr = t.arrayExpression(locationElements);
  const accessExpr = t.memberExpression(
    locationArrayExpr,
    t.cloneNode(indexExpression, true),
    true,
  );

  return t.jsxExpressionContainer(accessExpr);
}

function getLocationForSegments(
  filename: string,
  elementPath: NodePath<Expression | SpreadElement | null>,
  segments: PropertyAccessSegment[],
): string | null {
  if (!elementPath.node) return null;
  if (elementPath.isSpreadElement()) return null;

  let currentNode: t.Node | null = elementPath.node;

  for (const segment of segments) {
    if (segment.kind === "property") {
      if (!t.isObjectExpression(currentNode)) return null;
      let matchedProperty: t.ObjectProperty | null = null;
      for (const prop of currentNode.properties) {
        if (!t.isObjectProperty(prop)) continue;
        if (t.isIdentifier(prop.key) && prop.key.name === segment.name) {
          matchedProperty = prop;
          break;
        }
        if (t.isStringLiteral(prop.key) && prop.key.value === segment.name) {
          matchedProperty = prop;
          break;
        }
      }

      if (!matchedProperty) {
        return null;
      }

      currentNode = matchedProperty.value;
    } else {
      if (!t.isArrayExpression(currentNode)) return null;
      const arrayElement: t.Node | null | undefined =
        currentNode.elements[segment.index];
      if (!arrayElement || !t.isExpression(arrayElement)) return null;
      currentNode = arrayElement;
    }
  }

  const loc = currentNode?.loc ?? elementPath.node.loc;
  if (!loc) return null;

  return formatLocation(filename, loc);
}

function formatLocation(filename: string, loc: t.SourceLocation): string {
  const startLine = loc.start.line;
  const startColumn = loc.start.column + 1;
  const endLine = loc.end.line;
  const endColumn = loc.end.column + 1;
  const locationDescriptor = {
    file: filename,
    start: `${startLine}:${startColumn}`,
    end: `${endLine}:${endColumn}`,
  } as const;
  return JSON.stringify(locationDescriptor);
}
