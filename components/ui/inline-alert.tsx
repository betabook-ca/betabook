"use client";

import { Alert } from "@heroui/react";
import type { ReactNode } from "react";

type InlineAlertProps = {
  children: ReactNode;
  status?: "danger" | "warning" | "success" | "accent";
  title?: string;
  action?: ReactNode;
  id?: string;
  className?: string;
};

/** Operation feedback: errors interrupt, other notices announce politely.
 * Use FieldFeedback inside a field and ConfirmDeleteDialog for confirmation. */
export function InlineAlert({
  children,
  status = "danger",
  title,
  action,
  id,
  className,
}: InlineAlertProps) {
  return (
    <Alert
      id={id}
      status={status}
      role={status === "danger" ? "alert" : "status"}
      aria-atomic="true"
      className={className}
    >
      <Alert.Indicator />
      <Alert.Content className="min-w-0">
        {title && <Alert.Title>{title}</Alert.Title>}
        <div className="text-sm wrap-anywhere text-muted">{children}</div>
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </Alert.Content>
    </Alert>
  );
}
