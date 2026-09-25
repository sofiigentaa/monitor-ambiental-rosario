require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const apiRouter = require("./routes/api");
const reportesRouter = require("./routes/reportes");
const humoRouter = require("./routes/humo");
const exportarRouter = require("./routes/exportar");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);
app.use("/api/reportes", reportesRouter);
app.use("/api/humo", humoRouter);
app.use("/api/exportar", exportarRouter);

// Sirve el frontend hardcodeado directamente desde el backend (útil para
// levantar todo con un solo comando en desarrollo/demo).
app.use(express.static(path.join(__dirname, "..", "..", "frontend")));

app.get("/health", (req, res) => {
  res.json({ status: "ok", proyecto: "Monitor Ambiental Rosario" });
});

app.listen(PORT, () => {
  console.log(`Monitor Ambiental Rosario backend escuchando en http://localhost:${PORT}`);
  console.log(`API en http://localhost:${PORT}/api/puntos`);
});
