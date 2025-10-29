import React from "react";

export interface ElementOverrides {
  children?: React.ReactNode | string;
  attributes?: Record<string, string | number | boolean>;
  className?: string;
  style?: React.CSSProperties | string;
  src?: string;
  href?: string;
  alt?: string;
  title?: string;
  id?: string;
  filePath?: string;
}

export interface ElementUpdate {
  editorId: string;
  filePath: string;
  overrides: ElementOverrides | null;
}

export type ElementProps = Record<string, unknown> & {
  style?: React.CSSProperties | string;
  children?: React.ReactNode;
};

export interface BridgeMessage {
  type: string;
  updates: ElementUpdate[];
}

export interface LivePreviewBridgeProps {
  editorId: string;
  children: React.ReactNode;
  debug?: boolean;
  messageType?: string;
}

declare global {
  interface Window {
    __elementOverrides?: Record<string, ElementOverrides>;
  }
}

function propsProcessor(
  name: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (name === "ImageOptimizer") {
    return {
      ...props,
      originalProps: { ...(props?.originalProps || {}), ...props },
    };
  } else {
    return props;
  }
}

// Global state helpers
function ensureGlobalOverrides(): void {
  if (typeof window !== "undefined") {
    window.__elementOverrides = window.__elementOverrides || {};
  }
}

function getStoredOverrides(editorId: string): ElementOverrides {
  ensureGlobalOverrides();
  return window.__elementOverrides?.[editorId] || {};
}

function updateGlobalOverrides(
  editorId: string,
  overrides: ElementOverrides | null,
): void {
  ensureGlobalOverrides();
  if (!window.__elementOverrides) return;

  if (overrides === null || Object.keys(overrides).length === 0) {
    delete window.__elementOverrides[editorId];
  } else {
    window.__elementOverrides[editorId] = overrides;
  }
}

// Style merging utility
function mergeStyles(
  original: React.CSSProperties | string | undefined,
  override: React.CSSProperties | string,
): React.CSSProperties | string {
  if (typeof override !== "object" || typeof original !== "object") {
    return override;
  }
  return { ...(original || {}), ...override };
}

// Merge multiple overrides, with later overrides taking precedence
function mergeOverrides(
  overridesList: (ElementOverrides | null)[],
): ElementOverrides | null {
  const validOverrides = overridesList.filter(
    (override): override is ElementOverrides => override !== null,
  );

  if (validOverrides.length === 0) return null;
  if (validOverrides.length === 1) return validOverrides[0];

  let merged: ElementOverrides = {};

  for (const override of validOverrides) {
    merged = { ...merged, ...override };

    if (override.style && merged.style) {
      merged.style =
        typeof override.style === "object" && typeof merged.style === "object"
          ? { ...merged.style, ...override.style }
          : override.style;
    }

    if (override.attributes && merged.attributes) {
      merged.attributes = { ...merged.attributes, ...override.attributes };
    }
  }

  return merged;
}

// Get element file path from DOM
function getElementFilePath(editorId: string): string | null {
  if (typeof document === "undefined") return null;

  const element = document.querySelector(`[data-editor-id="${editorId}"]`);
  if (!element) return null;

  return (
    element.getAttribute("data-component-file") ||
    element.getAttribute("data-rendered-by") ||
    null
  );
}

// Helper function to get component name from child element
function getComponentName(child: React.ReactElement): string {
  if (typeof child.type === "string") {
    // HTML element like 'div', 'button', etc.
    return child.type;
  } else if (typeof child.type === "function") {
    // React component - get its name
    const func = child.type as any;
    return func.displayName || func.name || "Component";
  }
  return "Unknown";
}

function LivePreviewBridge({
  editorId,
  children,
  debug,
  messageType = "ELEMENT_UPDATE",
}: LivePreviewBridgeProps) {
  const [overrides, setOverrides] = React.useState<ElementOverrides>(() =>
    getStoredOverrides(editorId),
  );

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<BridgeMessage>) => {
      if (event.data?.type !== messageType) return;

      const elementFilePath = getElementFilePath(editorId);
      if (!elementFilePath) return;

      const relevantUpdates = event.data.updates.filter(
        (update) =>
          update.editorId === editorId && update.filePath === elementFilePath,
      );

      const newOverrides = mergeOverrides(
        relevantUpdates.map((u) => u.overrides),
      );

      debug &&
        console.log("[LivePreviewBridge]", {
          editorId,
          newOverrides,
          count: relevantUpdates.length,
        });

      setOverrides(newOverrides || {});
      updateGlobalOverrides(editorId, newOverrides);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }
  }, [editorId, debug, messageType]);

  // Validate single child
  if (React.Children.count(children) !== 1) return <>{children}</>;
  const child = React.Children.only(children);
  if (!React.isValidElement(child)) return <>{child}</>;

  // No overrides - return original
  if (!overrides || Object.keys(overrides).length === 0) {
    updateGlobalOverrides(editorId, null);
    return children;
  }

  // Build final props
  const { children: newChildren, attributes, ...direct } = overrides;
  const childProps = child.props as ElementProps;
  const props = {
    ...childProps,
    ...(attributes ?? {}),
    ...direct,
    style: direct.style
      ? mergeStyles(childProps.style, direct.style)
      : childProps.style,
  };

  const finalChildren = newChildren ?? childProps.children;
  const componentName = getComponentName(child);
  const processedProps = propsProcessor(componentName, props);

  // Update global and return
  updateGlobalOverrides(editorId, {
    ...processedProps,
    children: finalChildren,
  });
  debug &&
    console.log("[LivePreviewBridge] Applied:", {
      editorId,
      props: processedProps,
    });

  return React.cloneElement(child, processedProps, finalChildren);
}

export default LivePreviewBridge;
