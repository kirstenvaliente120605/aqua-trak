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

// Handle malformed JSON bodies gracefully as 400 Bad Request
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload." });
  }
  next(err);
});

app.use(async (req, res, next) => await attachUser(req, res, next));
app.use(router);

// Serve static frontend assets
app.use("/images", express.static(path.resolve(frontendPath, "assets")));
app.use("/assets", express.static(path.resolve(frontendPath, "assets")));
app.use("/pages", express.static(path.resolve(frontendPath, "pages")));
app.use(express.static(frontendPath));

app.use((req, res) => {
  res.status(404).sendFile(path.resolve(frontendPath, "pages/not-found.html"));
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled error:", error);
  res.status(500).sendFile(path.resolve(frontendPath, "pages/error.html"));
});

export default app;
