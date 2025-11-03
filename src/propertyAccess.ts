import { types as t } from "@babel/core";
import type { NodePath } from "@babel/traverse";
import type { Expression, PrivateName, SpreadElement } from "@babel/types";

export type AttributeValue =
  | string
  | Expression
  | t.StringLiteral
  | t.JSXExpressionContainer;

export type PropertyAccessSegment =
  | { kind: "property"; name: string }
  | { kind: "index"; index: number };

export type PropertyAccess = {
  baseName: string;
  segments: PropertyAccessSegment[];
};

export function unwrapExpressionPath(
  path: NodePath,
): NodePath<Expression> | null {
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

  if (path.isTSParameterProperty()) {
    const parameterPath = path.get("parameter");
    if (Array.isArray(parameterPath)) return null;
    return unwrapExpressionPath(parameterPath as NodePath);
  }

  return null;
}

export function extractPropertyAccess(
  expression: Expression,
): PropertyAccess | null {
  const unwrapped = unwrapExpression(expression);
  return buildPropertyAccess(unwrapped);
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

function buildPropertyAccess(expression: Expression): PropertyAccess | null {
  if (t.isIdentifier(expression)) {
    return { baseName: expression.name, segments: [] };
  }

  if (t.isMemberExpression(expression) && !expression.optional) {
    if (!t.isExpression(expression.object)) return null;
    const baseAccess = buildPropertyAccess(
      expression.object as Expression,
    );
    if (!baseAccess) return null;

    const segment = getPropertyAccessSegment(
      expression.property,
      expression.computed,
    );
    if (!segment) return null;

    return {
      baseName: baseAccess.baseName,
      segments: [...baseAccess.segments, segment],
    };
  }

  if (t.isOptionalMemberExpression(expression)) {
    if (!t.isExpression(expression.object)) return null;
    const baseAccess = buildPropertyAccess(
      expression.object as Expression,
    );
    if (!baseAccess) return null;

    const segment = getPropertyAccessSegment(
      expression.property,
      expression.computed,
    );
    if (!segment) return null;

    return {
      baseName: baseAccess.baseName,
      segments: [...baseAccess.segments, segment],
    };
  }

  return null;
}

export function getPropertyAccessSegment(
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

type LocationAttributeParams = {
  filename: string;
  elementPaths: NodePath<Expression | SpreadElement | null>[];
  segments: PropertyAccessSegment[];
  indexExpression?: Expression | null;
};

export function buildLocationAttributeValue({
  filename,
  elementPaths,
  segments,
  indexExpression = null,
}: LocationAttributeParams): AttributeValue | null {
  const locations = elementPaths.map((elementPath) =>
    getLocationForSegments(filename, elementPath, segments),
  );

  const availableLocations = locations.filter(
    (loc): loc is string => !!loc,
  );

  if (availableLocations.length === 0) {
    return null;
  }

  if (!indexExpression || elementPaths.length === 1) {
    return availableLocations[0] ?? null;
  }

  if (elementPaths.length === 1) {
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
