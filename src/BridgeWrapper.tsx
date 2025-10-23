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

export interface BridgeMessage {
  type: string;
  updates: ElementUpdate[];
}

export interface BridgeWrapperProps {
  editorId: string;
  children: React.ReactNode;
  debug?: boolean;
}

declare global {
  interface Window {
    __elementOverrides?: Record<string, ElementOverrides>;
  }
}

// Merge multiple overrides, with later overrides taking precedence
function mergeOverrides(overridesList: (ElementOverrides | null)[]): ElementOverrides | null {
  if (overridesList.some(override => override === null)) {
    return null;
  }
  
  const validOverrides = overridesList.filter((override): override is ElementOverrides => override !== null);
  
  if (validOverrides.length === 0) {
    return null;
  }
  
  if (validOverrides.length === 1) {
    return validOverrides[0];
  }
  
  let merged: ElementOverrides = {};
  
  for (const override of validOverrides) {
    merged = { ...merged, ...override };
    
    if (override.style && merged.style) {
      if (typeof override.style === 'object' && typeof merged.style === 'object') {
        merged.style = { ...merged.style, ...override.style };
      } else {
        merged.style = override.style;
      }
    }
    
    if (override.attributes && merged.attributes) {
      merged.attributes = { ...merged.attributes, ...override.attributes };
    }
  }
  
  return merged;
}

export function BridgeWrapper({
  editorId,
  children,
  debug,
}: BridgeWrapperProps) {
  const ensureGlobal = (): void => {
    if (typeof window === "undefined") return;
    window.__elementOverrides = window.__elementOverrides || {};
  };

  ensureGlobal();

  const [overrides, setOverrides] = React.useState<ElementOverrides>(() => {
    ensureGlobal();
    const stored = window.__elementOverrides?.[editorId] || {};
    return stored;
  });

  React.useEffect(() => {
    const getElementFilePath = (): string | null => {
      if (typeof document === "undefined") return null;
      
      const element = document.querySelector(`[data-editor-id="${editorId}"]`);
      if (!element) return null;
      
      return element.getAttribute('data-component-file') || 
             element.getAttribute('data-rendered-by') || 
             null;
    };

    const handleMessage = (event: MessageEvent<BridgeMessage>) => {
      const data = event.data;
      
      if (data?.type !== "ELEMENT_UPDATE") {
        return;
      }
      
      const elementFilePath = getElementFilePath();
      
      if (!elementFilePath) {
        return;
      }
      
      const relevantUpdates = data.updates.filter(update => 
        update.editorId === editorId && update.filePath === elementFilePath
      );
      
      const newOverrides = relevantUpdates.length === 0 
        ? null 
        : mergeOverrides(relevantUpdates.map(u => u.overrides));
      
      if (debug) {
        console.log("[BridgeWrapper]", "Element update received:", { 
          editorId, 
          filePath: elementFilePath, 
          mergedOverrides: newOverrides,
          totalUpdates: data.updates.length,
          relevantUpdates: relevantUpdates.length,
          mergedFrom: relevantUpdates.length > 1 ? `${relevantUpdates.length} updates` : "1 update"
        });
      }
      
      if (newOverrides === null) {
        setOverrides({});
        if (window.__elementOverrides) {
          delete window.__elementOverrides[editorId];
        }
        if (debug) {
          console.log("[BridgeWrapper]", "Reset to original:", { editorId });
        }
      } else {
        setOverrides(newOverrides || {});
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }
  }, [editorId, debug]);

  const count = React.Children.count(children);
  if (count !== 1) return <>{children}</>;

  const onlyChild = React.Children.only(children);
  if (!React.isValidElement(onlyChild)) return <>{onlyChild}</>;

  if (!overrides || Object.keys(overrides).length === 0) {
    ensureGlobal();
    if (window.__elementOverrides) {
      delete window.__elementOverrides[editorId];
    }
    return children;
  }

  type ElementProps = Record<string, unknown> & {
    style?: React.CSSProperties | string;
    children?: React.ReactNode;
  };

  const originalProps = onlyChild.props as ElementProps;
  const {
    children: overrideChildren,
    attributes,
    ...directOverrides
  } = overrides;
  const attributeOverrides = { ...(attributes ?? {}), ...directOverrides };

  const mergeStyles = (
    original: React.CSSProperties | string | undefined,
    override: React.CSSProperties | string,
  ): React.CSSProperties | string => {
    if (typeof override !== "object" || typeof original !== "object")
      return override;
    return { ...(original || {}), ...override };
  };

  const mergedStyle =
    attributeOverrides.style !== undefined
      ? mergeStyles(originalProps.style, attributeOverrides.style)
      : originalProps.style;

  if (debug && attributeOverrides.style !== undefined) {
    console.log("[BridgeWrapper]", "Style merge:", {
      editorId,
      original: originalProps.style,
      override: attributeOverrides.style,
      merged: mergedStyle,
    });
  }

  const mergedProps = {
    ...originalProps,
    ...attributeOverrides,
    ...(mergedStyle !== undefined && { style: mergedStyle }),
  };

  const finalChildren = overrideChildren ?? originalProps.children ?? null;

  ensureGlobal();
  if (window.__elementOverrides) {
    window.__elementOverrides[editorId] = {
      ...mergedProps,
      children: finalChildren,
    };
    if (debug) {
      console.log("[BridgeWrapper]", "Global snapshot:", {
        editorId,
        mergedProps,
        finalChildren,
        snapshot: window.__elementOverrides[editorId],
      });
    }
  }

  return React.cloneElement(onlyChild, mergedProps, finalChildren);
}
