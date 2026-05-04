import ReactDOM from "react-dom/client";
import App from "./App.tsx";

document.documentElement.dataset.appBuild = "2026-05-04-doc-explorer";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
