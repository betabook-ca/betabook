"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

import { dismissFeatureAnnouncement } from "@/actions";
import { FeatureCallout, type FeatureCalloutProps } from "@/components/ui/feature-callout";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import type { FeatureAnnouncementDefinition } from "@/lib/feature-announcements";

type ScopeProps = {
  userId: string;
  /** Concrete pathname without search parameters. */
  page: string;
  /** Server-filtered, undismissed announcements in oldest-first order. */
  announcements: readonly FeatureAnnouncementDefinition[];
  children: ReactNode;
  dismissAction?: (featureId: string) => Promise<ActionResult>;
};
const AnnouncementVisit = createContext<{
  feature: FeatureAnnouncementDefinition | undefined;
  visible: boolean;
  pending: boolean;
  error: string | null;
  dismiss: () => void;
} | null>(null);

/** Mount once per page visit. Search/filter refreshes keep the same selection;
 * switching viewers or pages resets it. Only a later visit offers the next release. */
export function FeatureAnnouncementScope(props: ScopeProps) {
  return <VisitState key={`${props.userId}:${props.page}`} {...props} />;
}

function VisitState({
  announcements,
  children,
  dismissAction = dismissFeatureAnnouncement,
}: ScopeProps) {
  const [feature] = useState(() => announcements[0]);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const visible =
    !dismissed &&
    feature !== undefined &&
    announcements.some((candidate) => candidate.featureId === feature.featureId);
  const dismiss = useCallback(async () => {
    if (!feature || !visible || saving.current) return;
    saving.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await dismissAction(feature.featureId);
      if (result.ok) setDismissed(true);
      else setError(result.error);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      saving.current = false;
      setPending(false);
    }
  }, [feature, visible, dismissAction]);
  const value = useMemo(
    () => ({
      feature,
      visible,
      pending,
      error,
      dismiss: () => {
        void dismiss();
      },
    }),
    [feature, visible, pending, error, dismiss],
  );
  return <AnnouncementVisit.Provider value={value}>{children}</AnnouncementVisit.Provider>;
}

/** Wrap a feature target. Without an eligible page scope, it is just the target. */
export function FeatureAnnouncement({
  featureId,
  children,
  isEnabled = true,
  placement,
}: {
  featureId: string;
  children: ReactNode;
  /** Temporarily hide while the highlighted workflow is open, without dismissing. */
  isEnabled?: boolean;
  placement?: FeatureCalloutProps["placement"];
}) {
  const visit = useContext(AnnouncementVisit);
  if (!visit?.feature || visit.feature.featureId !== featureId) return <>{children}</>;
  return (
    <FeatureCallout
      title={visit.feature.title}
      description={visit.feature.description}
      isOpen={isEnabled && visit.visible}
      isPending={visit.pending}
      error={visit.error}
      onDismiss={visit.dismiss}
      placement={placement}
    >
      {children}
    </FeatureCallout>
  );
}
