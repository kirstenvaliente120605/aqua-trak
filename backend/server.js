import app from "./src/app.js";

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  console.log(
    `AquaTracker Backend API & Server running at http://localhost:${port}`
  );
});
