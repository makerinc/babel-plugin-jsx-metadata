import React from "react";

export interface ElementOverrides {
  children?: React.ReactNode;
  attributes?: Record<string, string | number | boolean>;
  className?: string;
  style?: React.CSSProperties | string;
  src?: string;
  href?: string;
  alt?: string;
  title?: string;
  id?: string;
}

export interface BridgeMessage {
  type: string;
  editorId: string;
  overrides: ElementOverrides | null;
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
    const handleMessage = (event: MessageEvent<BridgeMessage>) => {
      const data = event.data;
      if (data?.type !== "ELEMENT_UPDATE" || data?.editorId !== editorId)
        return;

      const newOverrides = data.overrides;
      if (debug) {
        console.log("[BridgeWrapper]", "Received:", { editorId, newOverrides });
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

  // Type the original props more safely
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
