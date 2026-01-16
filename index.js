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

// Test de conexión para logs
pool.query('SELECT NOW()', (err) => {
  if (err) console.error("❌ ERROR DB:", err.message);
  else console.log("✅ Conexión a PostgreSQL establecida");
});

// --- 2. MIDDLEWARES ---
app.use(cors());
app.use(express.json());

// --- 3. RUTAS DE LA API (PRIORIDAD ALTA) ---
// Estas rutas deben responder JSON, no el HTML de React
app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    return res.json(result.rows);
  } catch (err) {
    console.error("Error en /api/autos:", err);
    return res.status(500).json({ error: "Error de base de datos" });
  }
});

app.post("/api/autos", async (req, res) => {
  try {
    const { nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda } = req.body;
    const query = `
      INSERT INTO autos 
      (nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
    const values = [nombre, parseInt(precio) || 0, imagenes, reservado || false, motor, transmision, parseInt(anio) || 0, combustible, descripcion, parseInt(kilometraje) || 0, moneda];
    const result = await pool.query(query, values);
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Error al guardar" });
  }
});

// --- 4. RUTA SEO PARA WHATSAPP (ANTES QUE STATIC) ---
app.get("/auto/:slug", async (req, res) => {
  console.log("🔍 Petición SEO para:", req.params.slug);
  
  let { slug } = req.params;
  slug = slug.split(" ")[0].split("%20")[0].toLowerCase();
  
  const indexPath = path.join(__dirname, "dist", "index.html");

  try {
    const result = await pool.query("SELECT * FROM autos");
    const auto = result.rows.find(a => {
        const n = a.nombre.toLowerCase().trim()
            .replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
        return n === slug;
    });

    if (!auto || !fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    let html = fs.readFileSync(indexPath, "utf8");
    const titulo = `${auto.nombre} | Norte Automotores`;
    const imagen = auto.imagenes?.[0]?.replace("/upload/", "/upload/f_jpg,q_auto,w_800/") || "";
    const precioTxt = `${auto.moneda} ${Number(auto.precio).toLocaleString("es-AR")}`;
    const desc = `${precioTxt} - Año ${auto.anio} - ${Number(auto.kilometraje).toLocaleString("es-AR")} km.`;

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
      <meta property="og:url" content="https://norteautomotores.up.railway.app/auto/${slug}">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
    `;

    return res.send(html.replace("</head>", `${metaTags}</head>`));

  } catch (err) {
    console.error("Error SEO:", err);
    return res.sendFile(indexPath);
  }
});

// --- 5. ARCHIVOS ESTÁTICOS ---
app.use(express.static(path.join(__dirname, "dist")));

// --- 6. MANEJO DE RUTAS NO ENCONTRADAS (FALLBACK) ---
app.get("*", (req, res) => {
  // Si alguien pide algo en /api que no existe, devolvemos 404 real, no el index.html
  if (req.url.startsWith("/api")) {
    return res.status(404).json({ error: "Ruta de API no encontrada" });
  }
  // Para todo lo demás, servimos React
  const indexPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Error: El frontend no está compilado (falta carpeta /dist)");
  }
});

// --- 7. ARRANQUE DEL SERVIDOR ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});