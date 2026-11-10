import ReactDOM from "react-dom/client";
import App from "./App.tsx";
// Catches the browser's install prompt before the app (and its sidebar) is up.
import "./components/InstallAppButton";

document.documentElement.dataset.appBuild = "2026-05-04-doc-explorer";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
