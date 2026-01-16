const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require('dotenv').config();

const app = express();

// --- 1. CONFIGURACIÓN DE MIDDLEWARES ---
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); 
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ARCHIVOS ESTÁTICOS: Importante que esté arriba
app.use(express.static(path.join(__dirname, "dist")));

// --- 2. CONEXIÓN A POSTGRES ---
const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// --- 3. FUNCIONES AUXILIARES ---
const crearSlug = (nombre) => {
  if (!nombre) return "";
  return nombre.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// --- 4. RUTAS DE LA API ---
app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

// ... (Tus rutas POST, PUT, DELETE de la API se mantienen igual que antes)
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


// --- 5. RUTA ESPECIAL PARA COMPARTIR (WhatsApp) ---
app.get("/share/auto/:slug", async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query("SELECT * FROM autos");
    const auto = result.rows.find((a) => crearSlug(a.nombre) === slug);
    if (!auto) return res.redirect("/");

    const titulo = `${auto.nombre} | Norte Automotores`;
    const imagen = auto.imagenes?.[0]?.replace("/upload/", "/upload/f_jpg,q_auto,w_800/") || "";

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta property="og:title" content="${titulo}" />
        <meta property="og:image" content="${imagen}" />
        <meta property="og:type" content="website" />
        <script>window.location.href = "/auto/${slug}";</script>
      </head>
      <body>Redireccionando a ${auto.nombre}...</body>
      </html>
    `);
  } catch (err) { res.redirect("/"); }
});

// --- 6. MANEJO DE RUTAS DE REACT (IMPORTANTE) ---
// Esta parte asegura que cualquier ruta que no sea de la API o Share cargue el index.html
const cargarApp = (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
};

app.get("/auto/:slug", cargarApp); // Ruta específica para autos compartidos
app.get("*", cargarApp);         // Cualquier otra ruta (Home, Admin, etc.)

// --- 7. INICIO ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Servidor listo en puerto ${PORT}`));