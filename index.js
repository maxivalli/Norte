const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require('dotenv').config();

const app = express();

// --- 1. CONFIGURACIÓN DE MIDDLEWARES ---
app.use(cors());
app.use(express.json());

// --- 2. CONEXIÓN A POSTGRES ---
const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// --- 3. INICIALIZACIÓN DE TABLA ---
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
    console.log("✅ Tabla 'autos' verificada");
  } catch (err) {
    console.error("❌ Error en tabla:", err.message);
  }
};
inicializarTabla();

// --- 4. FUNCIONES AUXILIARES ---
const crearSlug = (nombre) => {
  if (!nombre) return "";
  return nombre.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// --- 5. RUTAS DE LA API ---
app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

app.post("/api/autos", async (req, res) => {
  try {
    const { nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda } = req.body;
    const query = `INSERT INTO autos (nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
    const values = [nombre, parseInt(precio) || 0, imagenes, reservado || false, motor, transmision, parseInt(anio) || 0, combustible, descripcion, parseInt(kilometraje) || 0, moneda];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Error al guardar" }); }
});

app.put("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda } = req.body;
    const query = `UPDATE autos SET nombre=$1, precio=$2, imagenes=$3, reservado=$4, motor=$5, transmision=$6, anio=$7, combustible=$8, descripcion=$9, kilometraje=$10, moneda=$11 WHERE id=$12 RETURNING *`;
    const values = [nombre, parseInt(precio) || 0, imagenes, reservado, motor, transmision, parseInt(anio) || 0, combustible, descripcion, parseInt(kilometraje) || 0, moneda, id];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Error al editar" }); }
});

app.delete("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM autos WHERE id = $1", [id]);
    res.json({ message: "Eliminado" });
  } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});

// --- 6. RUTA DE COMPARTIR (WhatsApp/SEO) ---
// Esta ruta es la que genera la previsualización y luego redirige
app.get("/share/auto/:slug", async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query("SELECT * FROM autos");
    const auto = result.rows.find((a) => crearSlug(a.nombre) === slug);
    
    if (!auto) return res.redirect("/");

    const titulo = `${auto.nombre} | Norte Automotores`;
    const imagen = auto.imagenes?.[0]?.replace("/upload/", "/upload/f_jpg,q_auto,w_800/") || "";
    const precioTxt = `${auto.moneda} ${Number(auto.precio).toLocaleString("es-AR")}`;

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>${titulo}</title>
        <meta property="og:title" content="${titulo}" />
        <meta property="og:description" content="Precio: ${precioTxt}. Entrá para ver más detalles y fotos." />
        <meta property="og:image" content="${imagen}" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://norte-production.up.railway.app/auto/${slug}" />
        <meta name="twitter:card" content="summary_large_image">
        <script>
          window.location.href = "/auto/${slug}";
        </script>
      </head>
      <body style="background:#fff; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh;">
        <p>Cargando ${auto.nombre}...</p>
      </body>
      </html>
    `);
  } catch (err) {
    res.redirect("/");
  }
});

// --- 7. SERVIR ARCHIVOS ESTÁTICOS ---
// Servimos la carpeta dist para que el navegador encuentre los assets (JS, CSS)
app.use(express.static(path.join(__dirname, "dist")));

// --- 8. RUTA COMODÍN PARA REACT ---
// Cualquier ruta que no sea de la API o Share, carga el index.html original
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// --- 9. INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});