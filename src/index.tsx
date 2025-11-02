import type { ConfigAPI } from "@babel/core";
import crypto from "node:crypto";
import type { NodePath } from "@babel/traverse";
import { type PluginObj, types as t } from "@babel/core";
import type {
  ArrowFunctionExpression,
  FunctionExpression,
  CallExpression,
  JSXAttribute,
  JSXAttributeValue,
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXOpeningElement,
  JSXSpreadChild,
  JSXText,
  LVal,
  ReturnStatement,
  Expression,
  PrivateName,
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

  const processedLoopElements = new WeakSet<JSXElement>();

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

  type IdAssignmentOptions = {
    dynamicSuffix?: Expression | null;
  };

  function assignElementId(
    openingElement: JSXOpeningElement,
    context: IdGenerationContext,
    options: IdAssignmentOptions = {},
  ): string {
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

    const dynamicSuffix = options?.dynamicSuffix
      ? (t.cloneNode(options.dynamicSuffix, true) as Expression)
      : null;

    if (dynamicSuffix) {
      const template = t.templateLiteral(
        [
          t.templateElement({
            raw: `${finalId}:`,
            cooked: `${finalId}:`,
          }),
          t.templateElement({ raw: "", cooked: "" }, true),
        ],
        [dynamicSuffix],
      );

      setOrUpdateAttribute(
        openingElement,
        "data-editor-id",
        t.jsxExpressionContainer(template),
      );
    } else {
      setOrUpdateAttribute(openingElement, "data-editor-id", finalId);
    }

    return finalId;
  }

  type AttributeValue =
    | string
    | Expression
    | t.StringLiteral
    | t.JSXExpressionContainer;

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
    value: AttributeValue,
  ): void {
    const normalizedValue = normalizeAttributeValue(value);

    const attrs = openingElement.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === name) {
        attrs[i] = t.jsxAttribute(t.jsxIdentifier(name), normalizedValue);
        return;
      }
    }
    attrs.push(t.jsxAttribute(t.jsxIdentifier(name), normalizedValue));
  }

  function normalizeAttributeValue(value: AttributeValue): JSXAttributeValue {
    if (typeof value === "string") {
      return t.stringLiteral(value);
    }

    if (t.isJSXExpressionContainer(value)) {
      return value;
    }

    if (t.isStringLiteral(value)) {
      return value;
    }

    return t.jsxExpressionContainer(value);
  }

  function addComponentAttributes(
    openingElement: JSXOpeningElement,
    filename: string,
    componentName: string,
    context: IdGenerationContext,
    idOptions: IdAssignmentOptions = {},
  ): void {
    setOrUpdateAttribute(openingElement, "data-component-file", filename);
    setOrUpdateAttribute(openingElement, "data-component-name", componentName);
    assignElementId(openingElement, context, idOptions);
  }

  function addRenderedByAttributes(
    openingElement: JSXOpeningElement,
    filename: string,
    context: IdGenerationContext,
    idOptions: IdAssignmentOptions = {},
  ): void {
    setOrUpdateAttribute(openingElement, "data-rendered-by", filename);
    assignElementId(openingElement, context, idOptions);
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

    let functionLikePath: NodePath | null = null;
    if (path.isFunctionDeclaration()) {
      functionLikePath = path;
    } else if (path.isVariableDeclarator()) {
      const initPath = path.get("init");
      if (
        initPath &&
        (initPath.isFunctionExpression() || initPath.isArrowFunctionExpression())
      ) {
        functionLikePath = initPath;
      }
    }

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

    if (
      functionLikePath &&
      (functionLikePath.isFunctionDeclaration() ||
        functionLikePath.isFunctionExpression() ||
        functionLikePath.isArrowFunctionExpression())
    ) {
      functionLikePath.traverse({
        CallExpression(callPath: NodePath<CallExpression>) {
          processCollectionRenderingCall(
            callPath,
            filename,
            context,
            functionLikePath as NodePath,
          );
        },
      });
    }
  }

  type CollectionSourceInfo = {
    sourceName: string;
  };

  type LoopContext = {
    idExpression: Expression | null;
    sourceExpression: Expression | null;
    itemParamNames: Set<string>;
    collectionSourceName: string;
  };

  function processCollectionRenderingCall(
    callPath: NodePath<CallExpression>,
    filename: string,
    context: IdGenerationContext,
    componentFunctionPath: NodePath,
  ): void {
    if (!filename) return;

    if (!callPath.findParent((parent) => parent.isJSXExpressionContainer())) {
      return;
    }

    const calleePath = callPath.get("callee");
    if (!calleePath.isMemberExpression()) return;

    const propertyPath = calleePath.get("property");
    if (!propertyPath.isIdentifier({ name: "map" })) return;

    const functionParent = callPath.getFunctionParent();
    if (!functionParent) return;
    if (!isWithinComponentFunction(functionParent, componentFunctionPath)) {
      return;
    }

    const callbackArgPath = callPath.get("arguments")[0];
    if (
      !callbackArgPath ||
      (!callbackArgPath.isArrowFunctionExpression() &&
        !callbackArgPath.isFunctionExpression())
    ) {
      return;
    }

    const sourceObjectPath = calleePath.get("object");
    if (!sourceObjectPath.isIdentifier()) return;

    const collectionInfo = resolveCollectionSourceInfo(sourceObjectPath);
    if (!collectionInfo) return;

    const returnedElements = getReturnedJSXElements(callbackArgPath);
    if (returnedElements.length === 0) return;

    const itemParamNames = new Set<string>();
    if (callbackArgPath.node.params.length > 0) {
      const firstParam = callbackArgPath.node.params[0];
      if (firstParam) {
        collectNamesFromPattern(firstParam, itemParamNames);
      }
    }

    if (itemParamNames.size === 0) return;

    const indexExpression = getIndexParamExpression(callbackArgPath);

    returnedElements.forEach((elementPath) => {
      if (!elementPath.isJSXElement()) return;

      processLoopElement(
        elementPath,
        filename,
        context,
        collectionInfo,
        itemParamNames,
        indexExpression,
      );
    });
  }

  function isWithinComponentFunction(
    functionPath: NodePath,
    componentFunctionPath: NodePath,
  ): boolean {
    let current: NodePath | null = functionPath;

    while (current) {
      if (current.node === componentFunctionPath.node) {
        return true;
      }
      current = current.getFunctionParent();
    }

    return false;
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
    const initNode = initPath?.node ? unwrapStaticInitializer(initPath.node) : null;

    if (!initNode || !isStaticCollectionExpression(initNode)) {
      return null;
    }

    return {
      sourceName: sourceIdentifierPath.node.name,
    };
  }

  function unwrapStaticInitializer(node: t.Node): t.Node {
    if (t.isTSAsExpression(node) || t.isTypeCastExpression(node)) {
      return unwrapStaticInitializer(node.expression);
    }
    if (t.isTSTypeAssertion(node)) {
      return unwrapStaticInitializer(node.expression);
    }
    return node;
  }

  function isStaticCollectionExpression(node: t.Node | null): node is t.ArrayExpression {
    if (!node) return false;
    const resolved = unwrapStaticInitializer(node);
    return t.isArrayExpression(resolved);
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
      children.forEach((childPath) => {
        if (Array.isArray(childPath)) return;
        if (childPath.isJSXElement()) {
          elements.push(childPath);
        }
      });
      return elements;
    }

    if (bodyPath.isBlockStatement()) {
      bodyPath.traverse(
        {
          ReturnStatement(returnPath) {
            const argumentPath = returnPath.get("argument");
            if (!argumentPath) return;

            if (argumentPath.isJSXElement()) {
              elements.push(argumentPath as NodePath<JSXElement>);
            } else if (argumentPath.isJSXFragment()) {
              const fragmentChildren = argumentPath.get("children");
              fragmentChildren.forEach((fragmentChild) => {
                if (Array.isArray(fragmentChild)) return;
                if (fragmentChild.isJSXElement()) {
                  elements.push(fragmentChild);
                }
              });
            }
          },
          Function(innerFnPath) {
            innerFnPath.skip();
          },
          ArrowFunctionExpression(innerArrowPath) {
            innerArrowPath.skip();
          },
        },
        undefined,
        {},
      );
    }

    return elements;
  }

  function collectNamesFromPattern(param: LVal, names: Set<string>): void {
    if (t.isIdentifier(param)) {
      names.add(param.name);
      return;
    }

    if (t.isAssignmentPattern(param)) {
      collectNamesFromPattern(param.left, names);
      return;
    }

    if (t.isRestElement(param)) {
      collectNamesFromPattern(param.argument as LVal, names);
      return;
    }

    if (t.isObjectPattern(param)) {
      param.properties.forEach((prop) => {
        if (t.isObjectProperty(prop)) {
          const value = prop.value as LVal;
          collectNamesFromPattern(value, names);
        } else if (t.isRestElement(prop)) {
          collectNamesFromPattern(prop.argument as LVal, names);
        }
      });
      return;
    }

    if (t.isArrayPattern(param)) {
      param.elements.forEach((element) => {
        if (!element) return;
        if (t.isRestElement(element)) {
          collectNamesFromPattern(element.argument as LVal, names);
        } else {
          collectNamesFromPattern(element as LVal, names);
        }
      });
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

  function processLoopElement(
    elementPath: NodePath<JSXElement>,
    filename: string,
    context: IdGenerationContext,
    collectionInfo: CollectionSourceInfo,
    itemParamNames: Set<string>,
    indexExpression: Expression | null,
  ): void {
    if (processedLoopElements.has(elementPath.node)) return;
    if (!elementReferencesParamNames(elementPath, itemParamNames)) return;

    processedLoopElements.add(elementPath.node);

    const openingElement = elementPath.node.openingElement;
    const keyExpression = getKeyExpression(elementPath);

    const idExpressionBase = keyExpression ?? (indexExpression ? t.cloneNode(indexExpression, true) : null);
    const sourceExpressionBase =
      (indexExpression ? t.cloneNode(indexExpression, true) : null) ??
      (keyExpression ? t.cloneNode(keyExpression, true) : null);

    if (idExpressionBase) {
      addRenderedByAttributes(openingElement, filename, context, {
        dynamicSuffix: t.cloneNode(idExpressionBase, true),
      });
    } else {
      addRenderedByAttributes(openingElement, filename, context);
    }

    processJSXChildren(elementPath.node, filename, false, context);

    const loopContext: LoopContext = {
      idExpression: idExpressionBase ? t.cloneNode(idExpressionBase, true) : null,
      sourceExpression: sourceExpressionBase ? t.cloneNode(sourceExpressionBase, true) : null,
      itemParamNames,
      collectionSourceName: collectionInfo.sourceName,
    };

    applyLoopAnnotations(elementPath, filename, context, loopContext);
  }

  function getKeyExpression(
    elementPath: NodePath<JSXElement>,
  ): Expression | null {
    const attributes = elementPath
      .get("openingElement")
      .get("attributes") as NodePath[];

    for (const attrPath of attributes) {
      if (!attrPath.isJSXAttribute()) continue;

      const namePath = attrPath.get("name");
      if (!namePath.isJSXIdentifier({ name: "key" })) continue;

      const valuePath = attrPath.get("value");
      if (!valuePath?.node) continue;

      if (valuePath.isStringLiteral()) {
        return t.stringLiteral(valuePath.node.value);
      }

      if (valuePath.isJSXExpressionContainer()) {
        const expressionPath = valuePath.get("expression");
        if (expressionPath && expressionPath.node && t.isExpression(expressionPath.node)) {
          return t.cloneNode(expressionPath.node, true);
        }
      }
    }

    return null;
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
        // Ignore JSX identifiers - handled separately
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

  function cloneLoopExpression(expression: Expression | null): Expression | null {
    return expression ? t.cloneNode(expression, true) : null;
  }

  function applyLoopAnnotations(
    elementPath: NodePath<JSXElement>,
    filename: string,
    context: IdGenerationContext,
    loopContext: LoopContext,
  ): void {
    const annotateElement = (currentPath: NodePath<JSXElement>): void => {
      if (processedLoopElements.has(currentPath.node) && currentPath.node !== elementPath.node) {
        return;
      }

      const isComponent = isReactComponent(currentPath.node);

      if (
        loopContext.idExpression &&
        !isComponent &&
        elementReferencesParamNames(currentPath, loopContext.itemParamNames)
      ) {
        addRenderedByAttributes(currentPath.node.openingElement, filename, context, {
          dynamicSuffix: cloneLoopExpression(loopContext.idExpression),
        });
      }

      annotateDynamicChildrenForElement(currentPath, filename, loopContext);
      annotateImgSource(currentPath, filename, loopContext);
    };

    annotateElement(elementPath);

    elementPath.traverse(
      {
        JSXElement(innerPath) {
          annotateElement(innerPath);
        },
      },
      undefined,
      {},
    );
  }

  function annotateDynamicChildrenForElement(
    elementPath: NodePath<JSXElement>,
    filename: string,
    loopContext: LoopContext,
  ): void {
    if (!loopContext.sourceExpression) return;
    if (isReactComponent(elementPath.node)) return;

    const dynamicChildInfo = getDynamicChildInfo(
      elementPath,
      loopContext.itemParamNames,
    );

    if (!dynamicChildInfo) return;

    const value = buildCollectionSourceAttributeValue(
      filename,
      loopContext.collectionSourceName,
      cloneLoopExpression(loopContext.sourceExpression),
      dynamicChildInfo.propertyPath,
    );

    if (value) {
      setOrUpdateAttribute(
        elementPath.node.openingElement,
        "data-children-source",
        value,
      );
    }
  }

  function annotateImgSource(
    elementPath: NodePath<JSXElement>,
    filename: string,
    loopContext: LoopContext,
  ): void {
    if (!loopContext.sourceExpression) return;

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
      if (!expressionPath || !expressionPath.node || !t.isExpression(expressionPath.node)) continue;

      if (
        !expressionReferencesNames(
          expressionPath as NodePath<Expression>,
          loopContext.itemParamNames,
        )
      ) {
        continue;
      }

      const propertyPath = extractPropertyPath(
        expressionPath.node,
        loopContext.itemParamNames,
      );

      const sourceValue = buildCollectionSourceAttributeValue(
        filename,
        loopContext.collectionSourceName,
        cloneLoopExpression(loopContext.sourceExpression),
        propertyPath,
      );

      if (sourceValue) {
        setOrUpdateAttribute(openingElement, "data-img-source", sourceValue);
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
        // ignore JSX identifiers
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
  ): { propertyPath: string | null } | null {
    const childPaths = elementPath.get("children") as NodePath[];

    for (const childPath of childPaths) {
      if (Array.isArray(childPath)) continue;
      if (!childPath.isJSXExpressionContainer()) continue;

      const expressionPath = childPath.get("expression");
      if (!expressionPath || !expressionPath.node || !t.isExpression(expressionPath.node)) {
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

      const propertyPath = extractPropertyPath(
        expressionPath.node,
        itemParamNames,
      );

      return { propertyPath };
    }

    return null;
  }

  function extractPropertyPath(
    expression: Expression,
    itemParamNames: Set<string>,
  ): string | null {
    const unwrapped = unwrapExpression(expression);
    const path = buildPropertyPathFromExpression(unwrapped, itemParamNames);
    if (path === null || path === "") return null;
    return path;
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

  function buildPropertyPathFromExpression(
    expression: Expression,
    itemParamNames: Set<string>,
  ): string | null {
    if (t.isIdentifier(expression)) {
      return itemParamNames.has(expression.name) ? "" : null;
    }

    if (t.isMemberExpression(expression) && !expression.optional) {
      if (!t.isExpression(expression.object)) return null;
      const objectPath = buildPropertyPathFromExpression(
        expression.object as Expression,
        itemParamNames,
      );
      if (objectPath === null) return null;

      const propertySegment = getPropertySegment(expression.property, expression.computed);
      if (propertySegment === null) return null;
      return `${objectPath}${propertySegment}`;
    }

    if (t.isOptionalMemberExpression(expression)) {
      if (!t.isExpression(expression.object)) return null;
      const objectPath = buildPropertyPathFromExpression(
        expression.object as Expression,
        itemParamNames,
      );
      if (objectPath === null) return null;

      const propertySegment = getPropertySegment(expression.property, expression.computed);
      if (propertySegment === null) return null;

      return `${objectPath}${propertySegment}`;
    }

    return null;
  }

  function getPropertySegment(
    property: Expression | PrivateName,
    computed: boolean,
  ): string | null {
    if (t.isPrivateName(property)) return null;

    if (!computed) {
      if (t.isIdentifier(property)) {
        return `.${property.name}`;
      }
      if (t.isStringLiteral(property)) {
        return `.${property.value}`;
      }
    }

    if (t.isStringLiteral(property)) {
      return `["${property.value}"]`;
    }

    if (t.isNumericLiteral(property)) {
      return `[${property.value}]`;
    }

    return null;
  }

  function buildCollectionSourceAttributeValue(
    filename: string,
    sourceName: string,
    dynamicExpression: Expression | null,
    propertyPath: string | null,
  ): AttributeValue | null {
    const baseSegment = filename ? `${filename}:${sourceName}` : sourceName;
    if (!baseSegment) return null;

    const propertySuffix = propertyPath ?? "";

    if (!dynamicExpression) {
      return `${baseSegment}${propertySuffix}`;
    }

    if (t.isStringLiteral(dynamicExpression)) {
      const literal = JSON.stringify(dynamicExpression.value);
      return `${baseSegment}[${literal}]${propertySuffix}`;
    }

    if (t.isNumericLiteral(dynamicExpression)) {
      return `${baseSegment}[${dynamicExpression.value}]${propertySuffix}`;
    }

    const expressionClone = t.cloneNode(dynamicExpression, true) as Expression;
    const template = t.templateLiteral(
      [
        t.templateElement({
          raw: `${baseSegment}[`,
          cooked: `${baseSegment}[`,
        }),
        t.templateElement({ raw: `]${propertySuffix}`, cooked: `]${propertySuffix}` }, true),
      ],
      [expressionClone],
    );

    return t.jsxExpressionContainer(template);
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
    debugger?: boolean;
    messageType?: string;
    componentPath?: string; // Optional - path to user's LivePreviewBridge
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

  function processJSXElementForBridge(jsxElement: JSXElement, path: NodePath<JSXElement>): { 
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
        t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === "data-editor-id"
    );
    
    const editorId = editorIdAttr && t.isStringLiteral(editorIdAttr.value) ? editorIdAttr.value.value : null;
    
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
}

namespace DetachMetadata {
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
              if (attrName === "data-editor-id" || 
                  attrName === "data-component-file" || 
                  attrName === "data-component-name" || 
                  attrName === "data-rendered-by") {
                attrs.splice(i, 1);
              }
            }
          }
        },
      },
    };
  }
}

export type { ElementOverrides, BridgeMessage } from "./LivePreviewBridge";
export const attachMetadata = AttachMetadata.attachMetadata;
export const attachBridge = AttachBridge.attachBridge;
export const detachMetadata = DetachMetadata.detachMetadata;
export type MetadataOptions = AttachMetadata.MetadataOptions;
export type BridgeOptions = AttachBridge.BridgeOptions;
export type DetachOptions = DetachMetadata.DetachOptions;

// Auto-generated source code of LivePreviewBridge component
export const LivePreviewBridgeSource = "";
