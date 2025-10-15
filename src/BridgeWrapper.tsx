import React, { cloneElement, useEffect, useState } from "react";

type Override = {
  attributes?: Record<string, unknown>;
  children?: React.ReactNode;
};

type Props = {
  editorId: string;
  children: React.ReactNode;
};

export const BridgeWrapper: React.FC<Props> = ({ editorId, children }) => {
  const [overrides, setOverrides] = useState<Override>({});

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.type === "ELEMENT_UPDATE" &&
        event.data?.editorId === editorId
      ) {
        setOverrides(event.data.overrides || {});
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }
  }, [editorId]);

  if (React.Children.count(children) !== 1) {
    return <>{children}</>;
  }

  const onlyChild = React.Children.only(children);

  if (!React.isValidElement(onlyChild)) {
    return <>{onlyChild}</>;
  }

  const child = onlyChild as React.ReactElement<Record<string, unknown>>;

  const mergedProps = {
    ...(child.props ?? {}),
    ...(overrides.attributes ?? {}),
  };

  const finalChildren: React.ReactNode =
    overrides.children !== undefined
      ? overrides.children
      : (child.props.children as React.ReactNode) ?? null;

  return cloneElement(child, mergedProps, finalChildren);
};
