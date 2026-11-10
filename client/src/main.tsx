import ReactDOM from "react-dom/client";
// The page font and other base rules, before any component's own styles.
import "./styles/global.css";
import App from "./App.tsx";
// Catches the browser's install prompt before the app (and its sidebar) is up.
import "./components/InstallAppButton";
// Inside the Android app: hands files made in the page to the app.
import "./nativeBridge";

document.documentElement.dataset.appBuild = "2026-05-04-doc-explorer";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
