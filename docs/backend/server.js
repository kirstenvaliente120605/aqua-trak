import app from "./src/app.js";

const port = Number(process.env.PORT || 8080);

app.listen(port, () => {
  console.log(
    `AquaTracker Backend API & Server running at http://localhost:${port}`
  );
});
