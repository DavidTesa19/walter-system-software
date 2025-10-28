import type { GridView } from "../types/appView";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3004";

export const mapViewToStatus = (view: GridView): "accepted" | "pending" | "archived" => {
  switch (view) {
    case "active":
      return "accepted";
    case "pending":
      return "pending";
    case "archived":
    default:
      return "archived";
  }
};
