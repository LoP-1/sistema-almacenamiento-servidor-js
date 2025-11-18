const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('./config/db');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    const dir = path.join('uploads', 'archivos', String(year), month);
    
    fs.mkdirSync(dir, { recursive: true });
    
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext)
      .replace(/[^a-z0-9]/gi, '_')
      .substring(0, 50);
    
    cb(null, name + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

app.post('/api/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se recibio ningun archivo' 
      });
    }

    const { originalname, filename, size, mimetype, path: filePath } = req.file;
    const { descripcion, categoria } = req.body;
    
    const relativePath = filePath.replace(/\\/g, '/');
    
    const [result] = await pool.execute(
      `INSERT INTO archivos 
       (nombre_original, nombre_guardado, ruta, size, tipo, descripcion, categoria, fecha) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [originalname, filename, relativePath, size, mimetype, descripcion || null, categoria || 'general']
    );
    
    console.log(`[Upload] Archivo subido: ${originalname} (ID: ${result.insertId})`);
    
    res.json({ 
      success: true, 
      id: result.insertId,
      mensaje: 'Archivo subido correctamente',
      archivo: {
        id: result.insertId,
        nombre: originalname,
        size: size,
        ruta: relativePath
      }
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/archivos', async (req, res) => {
  try {
    const { categoria, limite, pagina } = req.query;
    
    let query = 'SELECT * FROM archivos';
    const params = [];
    
    if (categoria && categoria !== 'todos') {
      query += ' WHERE categoria = ?';
      params.push(categoria);
    }
    
    query += ' ORDER BY fecha DESC';
    
    const lim = parseInt(limite) || 50;
    const pag = parseInt(pagina) || 1;
    const offset = (pag - 1) * lim;
    
    if (limite && !isNaN(lim) && lim > 0) {
      query += ` LIMIT ${lim} OFFSET ${offset}`;
    }
    
    console.log('[DEBUG] Query:', query);
    console.log('[DEBUG] Params:', params);
    
    const [rows] = await pool.execute(query, params);
    
    let countQuery = 'SELECT COUNT(*) as total FROM archivos';
    const countParams = [];
    
    if (categoria && categoria !== 'todos') {
      countQuery += ' WHERE categoria = ?';
      countParams.push(categoria);
    }
    
    const [countResult] = await pool.execute(countQuery, countParams);
    
    res.json({
      archivos: rows,
      total: countResult[0].total,
      pagina: pag
    });
  } catch (error) {
    console.error('[ERROR] /api/archivos:', error.message);
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/archivos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT * FROM archivos WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/archivos/descargar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await pool.execute(
      'SELECT * FROM archivos WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    const archivo = rows[0];
    const filePath = path.join(__dirname, archivo.ruta);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo fisico no encontrado' });
    }
    
    console.log(`[Download] ${archivo.nombre_original} (ID: ${id})`);
    
    res.download(filePath, archivo.nombre_original);
  } catch (error) {
    console.error('[Download] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/archivos/preview/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await pool.execute(
      'SELECT * FROM archivos WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    const archivo = rows[0];
    const filePath = path.join(__dirname, archivo.ruta);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo fisico no encontrado' });
    }
    
    console.log(`[Preview] ${archivo.nombre_original} (ID: ${id})`);
    
    res.setHeader('Content-Type', archivo.tipo);
    res.setHeader('Content-Disposition', 'inline');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('[Preview] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/archivos/buscar/:termino', async (req, res) => {
  try {
    const { termino } = req.params;
    const [rows] = await pool.execute(
      `SELECT * FROM archivos 
       WHERE nombre_original LIKE ? 
       OR descripcion LIKE ? 
       OR categoria LIKE ?
       ORDER BY fecha DESC`,
      [`%${termino}%`, `%${termino}%`, `%${termino}%`]
    );
    
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/archivos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await pool.execute(
      'SELECT ruta FROM archivos WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    const filePath = rows[0].ruta;
    
    await pool.execute('DELETE FROM archivos WHERE id = ?', [id]);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    console.log(`[Delete] Archivo eliminado: ID ${id}`);
    
    res.json({ 
      success: true,
      mensaje: 'Archivo eliminado correctamente'
    });
  } catch (error) {
    console.error('[Delete] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/categorias', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT DISTINCT categoria, COUNT(*) as total FROM archivos GROUP BY categoria'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/estadisticas', async (req, res) => {
  try {
    const [total] = await pool.execute('SELECT COUNT(*) as total FROM archivos');
    const [porCategoria] = await pool.execute(
      'SELECT categoria, COUNT(*) as cantidad FROM archivos GROUP BY categoria'
    );
    const [tamanioTotal] = await pool.execute('SELECT SUM(size) as total_bytes FROM archivos');
    
    res.json({
      total_archivos: total[0].total,
      por_categoria: porCategoria,
      tamano_total_mb: (tamanioTotal[0].total_bytes / 1024 / 1024).toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/uploads', express.static('uploads'));

app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(500).json({ 
    success: false,
    error: err.message 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('============================================');
  console.log('  Sistema de Archivos Escaneados');
  console.log('============================================');
  console.log(`  Puerto: ${PORT}`);
  console.log(`  Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  URL Local: http://localhost:${PORT}`);
  console.log('============================================');
});
