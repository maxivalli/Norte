const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();

// --- 1. CONFIGURACIÓN DE CORS Y MIDDLEWARES ---
app.use(express.json());

app.use((req, res, next) => {
  // Permite que cualquier origen conecte
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Servir archivos estáticos de React (CSS, JS, etc.)
app.use(express.static(path.join(__dirname, "dist")));

// --- 2. CONEXIÓN A POSTGRES ---
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

// --- 3. AUTO-MIGRACIÓN Y VERIFICACIÓN DE DB ---
const inicializarTabla = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS autos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      precio NUMERIC DEFAULT 0,
      moneda VARCHAR(10) DEFAULT 'U$S',
      imagenes TEXT[], 
      motor VARCHAR(100),
      transmision VARCHAR(50),
      anio INTEGER,
      combustible VARCHAR(50),
      kilometraje INTEGER,
      descripcion TEXT,
      reservado BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log("✅ Tabla 'autos' verificada en la base de datos");
  } catch (err) {
    console.error("❌ Error en tabla:", err.message);
  }
};

inicializarTabla();

// --- 4. FUNCIONES AUXILIARES ---
const crearSlug = (nombre) => {
  if (!nombre) return "";
  return nombre
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// --- 5. RUTAS DE LA API (Prioridad Alta) ---

app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error en GET /api/autos:", err.message);
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

app.post("/api/autos", async (req, res) => {
  try {
    const {
      nombre,
      precio,
      imagenes,
      reservado,
      motor,
      transmision,
      anio,
      combustible,
      descripcion,
      kilometraje,
      moneda,
    } = req.body;
    const query = `
      INSERT INTO autos 
      (nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
    const values = [
      nombre,
      parseInt(precio) || 0,
      imagenes,
      reservado || false,
      motor,
      transmision,
      parseInt(anio) || 0,
      combustible,
      descripcion,
      parseInt(kilometraje) || 0,
      moneda,
    ];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al guardar" });
  }
});

app.put("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      precio,
      imagenes,
      reservado,
      motor,
      transmision,
      anio,
      combustible,
      descripcion,
      kilometraje,
      moneda,
    } = req.body;
    const query = `
      UPDATE autos SET nombre=$1, precio=$2, imagenes=$3, reservado=$4, motor=$5, transmision=$6, anio=$7, combustible=$8, descripcion=$9, kilometraje=$10, moneda=$11
      WHERE id=$12 RETURNING *`;
    const values = [
      nombre,
      parseInt(precio) || 0,
      imagenes,
      reservado,
      motor,
      transmision,
      parseInt(anio) || 0,
      combustible,
      descripcion,
      parseInt(kilometraje) || 0,
      moneda,
      id,
    ];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al editar" });
  }
});

app.delete("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM autos WHERE id = $1", [id]);
    res.json({ message: "Eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar" });
  }
});

// --- 6. RUTA PARA PREVISUALIZACIÓN SEO (WhatsApp/Redes) ---
app.get("/auto/:slug", async (req, res) => {
  const { slug } = req.params;
  const indexPath = path.join(__dirname, "dist", "index.html");

  try {
    // Buscamos el auto en la base de datos que coincida con el slug
    const result = await pool.query("SELECT * FROM autos");
    const auto = result.rows.find((a) => crearSlug(a.nombre) === slug);

    if (!auto || !fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    let html = fs.readFileSync(indexPath, "utf8");

    // Datos para las etiquetas Meta
    const titulo = `${auto.nombre} | Norte Automotores`;
    const precioTxt = `${auto.moneda} ${Number(auto.precio).toLocaleString(
      "es-AR"
    )}`;
    const desc = `${precioTxt} - Año ${auto.anio} - ${Number(
      auto.kilometraje
    ).toLocaleString("es-AR")} km.`;

    // Optimizamos la imagen para WhatsApp (forzamos jpg)
    const imagen =
      auto.imagenes && auto.imagenes[0]
        ? auto.imagenes[0].replace("/upload/", "/upload/f_jpg,q_auto,w_800/")
        : "";

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

    // Reemplazamos el title original por todo el bloque de metas
    html = html.replace(/<title>.*?<\/title>/, metaTags);

    res.send(html);
  } catch (err) {
    console.error("Error in SEO middleware:", err);
    res.sendFile(indexPath);
  }
});

// --- 7. RUTA COMODÍN PARA REACT (Al final de todo) ---
// Usamos RegExp para evitar errores de la librería path-to-regexp
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// --- 8. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
