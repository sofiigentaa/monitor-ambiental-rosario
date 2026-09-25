const express = require("express");
const router = express.Router();

// GET /api/telegram/info -> si el bot esta configurado y su @usuario, para
// que el frontend pueda armar el link "Recibí alertas en Telegram" (o
// esconder el boton si todavia no hay bot configurado).
router.get("/info", (req, res) => {
  const usuario = process.env.TELEGRAM_BOT_USERNAME || null;
  const disponible = Boolean(process.env.TELEGRAM_BOT_TOKEN && usuario);
  res.json({ disponible, usuario });
});

module.exports = router;
