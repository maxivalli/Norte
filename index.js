const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require('dotenv').config();

const app = express();

// --- 1. CONFIGURACIÓN DE BASE DE DATOS ---
const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC, 
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

// --- 3. RUTA SEO (IMPORTANTE: Antes de express.static) ---
app.get("/auto/:slug", async (req, res) => {
  console.log("🔍 Petición SEO recibida para slug:", req.params.slug);
  
  let { slug } = req.params;
  // Limpiar posibles textos pegados o espacios
  slug = slug.split(" ")[0].split("%20")[0].toLowerCase();

  const indexPath = path.join(__dirname, "dist", "index.html");

  try {
    const result = await pool.query("SELECT * FROM autos");
    
    // Función para comparar el slug igual que el frontend
    const auto = result.rows.find((a) => {
        const nombreLimpio = a.nombre.toLowerCase().trim()
            .replace(/[^\w\s-]/g, "")
            .replace(/[\s_-]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return nombreLimpio === slug;
    });

    if (!auto) {
      console.log("⚠️ Auto no encontrado en DB para el slug:", slug);
      return res.sendFile(indexPath);
    }

    console.log("⭐ Auto encontrado:", auto.nombre);
    
    if (!fs.existsSync(indexPath)) {
      console.error("❌ No se encontró el archivo index.html en /dist");
      return res.status(500).send("Error: index.html no encontrado");
    }

    let html = fs.readFileSync(indexPath, "utf8");

    // Preparar metadatos
    const titulo = `${auto.nombre} | Norte Automotores`;
    const precioTxt = `${auto.moneda} ${Number(auto.precio).toLocaleString("es-AR")}`;
    const desc = `${precioTxt} - Año ${auto.anio} - ${Number(auto.kilometraje).toLocaleString("es-AR")} km.`;
    
    // Transformación de imagen para WhatsApp
    const imagen = auto.imagenes && auto.imagenes[0] 
      ? auto.imagenes[0].replace("/upload/", "/upload/f_jpg,q_auto,w_800/") 
      : "";

    const metaTags = `
      <title>${titulo}</title>
      <meta name="description" content="${desc}">
      <meta property="og:title" content="${titulo}">
      <meta property="og:description" content="${desc}">
      <meta property="og:image" content="${imagen}">
      <meta property="og:image:width" content="800">
      <meta property="og:image:height" content="600">
      <meta property="og:url" content="https://norteautomotores.up.railway.app/auto/${slug}">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
    `;

    // Inyectamos las etiquetas antes del cierre de head
    html = html.replace("</head>", `${metaTags}</head>`);

    res.send(html);

  } catch (err) {
    console.error("❌ Error en la lógica SEO:", err);
    res.sendFile(indexPath);
  }
});

// --- 4. RUTAS API ---
app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener autos" });
  }
});

// POST, PUT, DELETE...
app.post("/api/autos", async (req, res) => {
    try {
      const { nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda } = req.body;
      const query = `
        INSERT INTO autos 
        (nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
      const values = [nombre, parseInt(precio) || 0, imagenes, reservado || false, motor, transmision, parseInt(anio) || 0, combustible, descripcion, parseInt(kilometraje) || 0, moneda];
      const result = await pool.query(query, values);
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Error al guardar" });
    }
});

// --- 5. SERVIR ARCHIVOS ESTÁTICOS (Después de las rutas dinámicas) ---
app.use(express.static(path.join(__dirname, "dist")));

// --- 6. RUTA COMODÍN PARA REACT ---
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// --- 7. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});