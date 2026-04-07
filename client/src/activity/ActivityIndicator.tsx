import React from "react";
import type { ActivityState } from "./activityUtils";
import "./ActivityIndicator.css";

interface ActivityIndicatorProps {
  state?: ActivityState;
  count?: number;
  title?: string;
  muted?: boolean;
}

const formatCount = (count: number) => (count > 99 ? "99+" : String(count));

const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({ state = "none", count = 0, title, muted = false }) => {
  if (count > 0) {
    return (
      <span
        className={`activity-indicator activity-indicator--count ${muted ? "activity-indicator--muted" : ""}`}
        title={title}
        aria-label={title}
      >
        {formatCount(count)}
      </span>
    );
  }

  if (state === "none") {
    return null;
  }

  return (
    <span
      className={`activity-indicator activity-indicator--dot activity-indicator--${state} ${muted ? "activity-indicator--muted" : ""}`}
      title={title}
      aria-label={title}
    />
  );
};

export default ActivityIndicator;
