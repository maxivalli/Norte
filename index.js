const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require('dotenv').config();

const app = express();

// --- 1. CONFIGURACIÓN DE BASE DE DATOS ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()', (err) => {
  if (err) console.error("❌ ERROR DB:", err.message);
  else console.log("✅ Conexión a PostgreSQL establecida");
});

// --- 2. MIDDLEWARES ---
app.use(cors());
app.use(express.json());

// --- 3. RUTA SEO (ESTA ES LA PRIORIDAD MÁXIMA) ---
// La ponemos antes que cualquier otra cosa para interceptar a WhatsApp
app.get("/auto/:slug", async (req, res) => {
  console.log("🔍 [SEO] Petición detectada para slug:", req.params.slug);
  
  const { slug } = req.params;
  const slugLimpio = slug.split(" ")[0].split("%20")[0].toLowerCase();
  
  // Ruta absoluta al index.html
  const indexPath = path.resolve(__dirname, "dist", "index.html");

  try {
    const result = await pool.query("SELECT * FROM autos");
    const auto = result.rows.find(a => {
        const n = a.nombre.toLowerCase().trim()
            .replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
        return n === slugLimpio;
    });

    if (!auto) {
      console.log("⚠️ [SEO] Auto no encontrado en DB:", slugLimpio);
      return res.sendFile(indexPath);
    }

    console.log("⭐ [SEO] Auto encontrado:", auto.nombre);

    if (!fs.existsSync(indexPath)) {
      console.error("❌ [SEO] No se encontró el archivo index.html en /dist");
      return res.status(500).send("Error interno: dist/index.html no existe");
    }

    let html = fs.readFileSync(indexPath, "utf8");

    // Datos del auto
    const titulo = `${auto.nombre} | Norte Automotores`;
    const imagen = auto.imagenes?.[0]?.replace("/upload/", "/upload/f_jpg,q_auto,w_800/") || "";
    const precioTxt = `${auto.moneda} ${Number(auto.precio).toLocaleString("es-AR")}`;
    const desc = `${precioTxt} - Año ${auto.anio} - ${Number(auto.kilometraje).toLocaleString("es-AR")} km.`;

    // Metatags para redes sociales
    const metaTags = `
<title>${titulo}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${imagen}">
<meta property="og:image:secure_url" content="${imagen}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="800">
<meta property="og:image:height" content="600">
<meta property="og:url" content="https://norteautomotores.up.railway.app/auto/${slugLimpio}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">`;

    // Inyectamos justo después del <head>
    const nuevoHtml = html.replace("<head>", `<head>${metaTags}`);
    
    return res.send(nuevoHtml);

  } catch (err) {
    console.error("❌ [SEO] Error crítico:", err);
    return res.sendFile(indexPath);
  }
});

// --- 4. RUTAS DE LA API ---
app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: "Error DB" });
  }
});

// --- 5. ARCHIVOS ESTÁTICOS ---
app.use(express.static(path.resolve(__dirname, "dist")));

// --- 6. CATCH-ALL (PARA TODAS LAS DEMÁS RUTAS) ---
app.get(/.*/, (req, res) => {
  const indexPath = path.resolve(__dirname, "dist", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Front-end no disponible. Verifica el build.");
  }
});

// --- 7. ARRANQUE ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});