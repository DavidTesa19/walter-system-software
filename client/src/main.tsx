import { provideGlobalGridOptions } from "ag-grid-community";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";

provideGlobalGridOptions({ theme: "legacy" });

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
