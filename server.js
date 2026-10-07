import app from "./backend/src/app.js";

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  console.log(`AquaTracker running at http://localhost:${port}`);
});
