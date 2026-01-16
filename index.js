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

// Test de conexión para ver en logs de Railway
pool.query('SELECT NOW()', (err) => {
  if (err) console.error("❌ ERROR DE CONEXIÓN DB:", err.message);
  else console.log("✅ Conexión a PostgreSQL establecida correctamente");
});

// --- 2. MIDDLEWARES ---
app.use(express.json());
app.use(cors());

// --- 3. RUTAS DE LA API (PRIORIDAD ALTA) ---
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

// --- 4. RUTA SEO (PARA WHATSAPP) ---
app.get("/auto/:slug", async (req, res) => {
  console.log("🔍 Petición SEO recibida para slug:", req.params.slug);
  
  let { slug } = req.params;
  slug = slug.split(" ")[0].split("%20")[0].toLowerCase();

  const indexPath = path.join(__dirname, "dist", "index.html");

  try {
    const result = await pool.query("SELECT * FROM autos");
    const auto = result.rows.find((a) => {
        const nombreLimpio = a.nombre.toLowerCase().trim()
            .replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
        return nombreLimpio === slug;
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
      <meta property="og:url" content="https://norteautomotores.up.railway.app/auto/${slug}">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
    `;

    return res.send(html.replace("</head>", `${metaTags}</head>`));

  } catch (err) {
    console.error("❌ Error SEO:", err);
    return res.sendFile(indexPath);
  }
});

// --- 5. ARCHIVOS ESTÁTICOS ---
app.use(express.static(path.join(__dirname, "dist")));

// --- 6. CATCH-ALL CON EXPRESIÓN REGULAR (LA QUE FUNCIONA) ---
// Usamos /.*/ para atrapar todo sin que path-to-regexp se queje
app.get(/.*/, (req, res) => {
  if (req.url.startsWith("/api")) {
    return res.status(404).json({ error: "API not found" });
  }
  const indexPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Error: No se encontró la carpeta dist. Ejecutá npm run build.");
  }
});

// --- 7. ARRANQUE ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});