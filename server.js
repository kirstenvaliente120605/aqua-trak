import app from "./backend/src/app.js";

const port = Number(process.env.PORT || 3001);
const server = app.listen(port, () => {
  console.log(`AquaTracker running at http://localhost:${port}`);
});
server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} already in use. Try PORT=3002 or kill existing node.exe (PID: see netstat -ano | findstr :${port}).`
    );
    process.exit(1);
  }
  console.error("Server error:", err.message);
  process.exit(1);
});
