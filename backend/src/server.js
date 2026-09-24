const express = require("express");
const cors = require("cors");
const path = require("path");
const apiRouter = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);

// Sirve el frontend hardcodeado directamente desde el backend (útil para
// levantar todo con un solo comando en desarrollo/demo).
app.use(express.static(path.join(__dirname, "..", "..", "frontend")));

app.get("/health", (req, res) => {
  res.json({ status: "ok", proyecto: "birriaecolab" });
});

app.listen(PORT, () => {
  console.log(`birriaecolab backend escuchando en http://localhost:${PORT}`);
  console.log(`API en http://localhost:${PORT}/api/puntos`);
});
