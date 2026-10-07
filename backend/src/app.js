import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachUser } from "./middleware/auth.js";
import { router } from "./routes/index.js";

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
// root is .../backend/src -> ../.. is project root -> frontend
const frontendPath = path.resolve(root, "../../frontend");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(attachUser);
app.use(router);

// Serve static frontend assets (css, js, assets, pages)
app.use(express.static(frontendPath));
app.use("/pages", express.static(path.resolve(frontendPath, "pages")));

app.use((req, res) => {
  res.status(404).sendFile(path.resolve(frontendPath, "pages/not-found.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).sendFile(path.resolve(frontendPath, "pages/error.html"));
});

export default app;
