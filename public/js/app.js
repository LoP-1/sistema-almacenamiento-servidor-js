class ArchivoManager {
  constructor() {
    this.apiUrl = '/api';
    this.currentPage = 1;
    this.itemsPerPage = 12;
    this.currentCategory = 'todos';
    this.searchTimeout = null;
    this.currentFile = null;
    this.categorias = ['General', 'Facturas', 'Contratos', 'Documentos', 'Actas', 'Recibos', 'Imagenes'];
    this.init();
  }

  init() {
    this.cargarCategoriasDesdeLocalStorage();
    this.actualizarSelectsCategorias();
    this.setupEventListeners();
    this.cargarArchivos();
    this.cargarEstadisticas();
  }

  setupEventListeners() {
    document.getElementById('uploadForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.subirArchivo();
    });
    
    document.getElementById('buscar').addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.buscarArchivos(e.target.value);
      }, 500);
    });

    document.getElementById('filtroCategoria').addEventListener('change', (e) => {
      this.currentCategory = e.target.value;
      this.currentPage = 1;
      this.cargarArchivos();
    });

    document.getElementById('archivo').addEventListener('change', (e) => {
      this.handleFileSelect(e);
    });

    document.getElementById('closePreview').addEventListener('click', () => {
      this.clearPreview();
    });

    document.getElementById('btnGestionarCategorias').addEventListener('click', () => {
      this.abrirModalCategorias();
    });

    document.getElementById('closeCategorias').addEventListener('click', () => {
      this.cerrarModalCategorias();
    });

    document.getElementById('btnAgregarCategoria').addEventListener('click', () => {
      this.agregarCategoria();
    });

    document.getElementById('nuevaCategoria').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.agregarCategoria();
      }
    });
  }

  cargarCategoriasDesdeLocalStorage() {
    const saved = localStorage.getItem('categorias');
    if (saved) {
      try {
        this.categorias = JSON.parse(saved);
      } catch (e) {
        console.error('Error al cargar categorias:', e);
      }
    }
  }

  guardarCategoriasEnLocalStorage() {
    localStorage.setItem('categorias', JSON.stringify(this.categorias));
  }

  actualizarSelectsCategorias() {
    const selectCategoria = document.getElementById('categoria');
    const selectFiltro = document.getElementById('filtroCategoria');
    
    selectCategoria.innerHTML = this.categorias.map(cat => 
      `<option value="${cat}">${cat}</option>`
    ).join('');
    
    selectFiltro.innerHTML = '<option value="todos">Todas las categorias</option>' + 
      this.categorias.map(cat => 
        `<option value="${cat.toLowerCase()}">${cat}</option>`
      ).join('');
  }

  abrirModalCategorias() {
    const modal = document.getElementById('modalCategorias');
    modal.style.display = 'flex';
    this.renderizarListaCategorias();
  }

  cerrarModalCategorias() {
    const modal = document.getElementById('modalCategorias');
    modal.style.display = 'none';
    document.getElementById('nuevaCategoria').value = '';
  }

  agregarCategoria() {
    const input = document.getElementById('nuevaCategoria');
    const categoria = input.value.trim();
    
    if (!categoria) {
      this.mostrarNotificacion('Por favor ingresa un nombre de categoria', 'error');
      return;
    }

    const categoriaCapitalizada = categoria.charAt(0).toUpperCase() + categoria.slice(1);
    
    if (this.categorias.some(c => c.toLowerCase() === categoriaCapitalizada.toLowerCase())) {
      this.mostrarNotificacion('Esta categoria ya existe', 'error');
      return;
    }

    this.categorias.push(categoriaCapitalizada);
    this.guardarCategoriasEnLocalStorage();
    this.actualizarSelectsCategorias();
    this.renderizarListaCategorias();
    input.value = '';
    this.mostrarNotificacion('Categoria agregada correctamente', 'success');
  }

  eliminarCategoria(categoria) {
    if (categoria.toLowerCase() === 'general') {
      this.mostrarNotificacion('No se puede eliminar la categoria General', 'error');
      return;
    }

    if (!confirm(`Seguro que deseas eliminar la categoria "${categoria}"?`)) {
      return;
    }

    this.categorias = this.categorias.filter(c => c !== categoria);
    this.guardarCategoriasEnLocalStorage();
    this.actualizarSelectsCategorias();
    this.renderizarListaCategorias();
    this.mostrarNotificacion('Categoria eliminada', 'success');
  }

  async renderizarListaCategorias() {
    const container = document.getElementById('listaCategorias');
    
    const response = await fetch(`${this.apiUrl}/estadisticas`).catch(() => null);
    let stats = { por_categoria: [] };
    
    if (response && response.ok) {
      stats = await response.json();
    }

    container.innerHTML = this.categorias.map(cat => {
      const catStats = stats.por_categoria.find(s => 
        s.categoria.toLowerCase() === cat.toLowerCase()
      );
      const count = catStats ? catStats.cantidad : 0;
      const isDefault = cat.toLowerCase() === 'general';
      
      return `
        <div class="categoria-item ${isDefault ? 'default' : ''}">
          <div>
            <span class="categoria-nombre">${cat}</span>
            <span class="categoria-count">(${count} archivos)</span>
          </div>
          <button 
            class="btn-delete-categoria" 
            onclick="app.eliminarCategoria('${cat}')"
            ${isDefault ? 'disabled' : ''}
          >
            ${isDefault ? 'Por Defecto' : 'Eliminar'}
          </button>
        </div>
      `;
    }).join('');
  }

  handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (!file) {
      this.clearPreview();
      return;
    }

    this.currentFile = file;
    const previewContainer = document.getElementById('filePreviewContainer');
    const previewElement = document.getElementById('filePreview');
    const fileNameElement = document.getElementById('previewFileName');
    const fileSizeElement = document.getElementById('previewFileSize');

    previewContainer.style.display = 'block';
    fileNameElement.textContent = file.name;
    fileSizeElement.textContent = this.formatFileSize(file.size);

    previewElement.innerHTML = '<div class="preview-loading"><div class="loader"></div><p>Cargando vista previa...</p></div>';

    const fileType = file.type;

    if (fileType.startsWith('image/')) {
      this.previewImage(file, previewElement);
    } else if (fileType === 'application/pdf') {
      this.previewPDFFile(file, previewElement);
    } else {
      this.showNoPreview(file, previewElement);
    }
  }

  previewImage(file, previewElement) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      previewElement.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    
    reader.onerror = () => {
      this.showPreviewError(previewElement);
    };
    
    reader.readAsDataURL(file);
  }

  previewPDFFile(file, previewElement) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const blob = new Blob([e.target.result], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      previewElement.innerHTML = `
        <iframe src="${url}" type="application/pdf"></iframe>
      `;
      
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    
    reader.onerror = () => {
      this.showPreviewError(previewElement);
    };
    
    reader.readAsArrayBuffer(file);
  }

  showNoPreview(file, previewElement) {
    const extension = file.name.split('.').pop().toUpperCase();
    const icon = this.getFileIconByName(file.name);
    
    previewElement.innerHTML = `
      <div class="preview-placeholder">
        <div class="preview-placeholder-icon">${icon}</div>
        <p>No hay vista previa disponible</p>
        <p><strong>${extension}</strong> - ${this.formatFileSize(file.size)}</p>
      </div>
    `;
  }

  showPreviewError(previewElement) {
    previewElement.innerHTML = `
      <div class="preview-error">
        <div class="preview-error-icon">( x_x )</div>
        <p>Error al cargar la vista previa</p>
      </div>
    `;
  }

  clearPreview() {
    const previewContainer = document.getElementById('filePreviewContainer');
    const previewElement = document.getElementById('filePreview');
    const fileInput = document.getElementById('archivo');
    
    previewContainer.style.display = 'none';
    previewElement.innerHTML = '';
    fileInput.value = '';
    this.currentFile = null;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  getFileIconByName(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    
    const iconMap = {
      'pdf': '[PDF]',
      'doc': '[DOC]',
      'docx': '[DOC]',
      'xls': '[XLS]',
      'xlsx': '[XLS]',
      'jpg': '[IMG]',
      'jpeg': '[IMG]',
      'png': '[IMG]',
      'gif': '[IMG]',
      'svg': '[IMG]',
      'zip': '[ZIP]',
      'rar': '[ZIP]',
      '7z': '[ZIP]'
    };
    
    return iconMap[extension] || '[FILE]';
  }

  async subirArchivo() {
    const form = document.getElementById('uploadForm');
    const formData = new FormData(form);
    const uploadBtn = form.querySelector('button[type="submit"]');
    const uploadText = document.getElementById('uploadText');
    const uploadLoader = document.getElementById('uploadLoader');
    
    uploadText.style.display = 'none';
    uploadLoader.style.display = 'inline-block';
    uploadBtn.disabled = true;
    
    try {
      const response = await fetch(`${this.apiUrl}/upload`, {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.mostrarNotificacion('Archivo subido exitosamente', 'success');
        form.reset();
        this.clearPreview();
        this.cargarArchivos();
        this.cargarEstadisticas();
      } else {
        this.mostrarNotificacion(data.error || 'Error al subir archivo', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      this.mostrarNotificacion('Error al subir archivo', 'error');
    } finally {
      uploadText.style.display = 'inline';
      uploadLoader.style.display = 'none';
      uploadBtn.disabled = false;
    }
  }

  async cargarArchivos() {
    const container = document.getElementById('archivos-list');
    container.innerHTML = '<div class="loading">Cargando archivos...</div>';
    
    try {
      const params = new URLSearchParams({
        categoria: this.currentCategory,
        limite: this.itemsPerPage,
        pagina: this.currentPage
      });

      const response = await fetch(`${this.apiUrl}/archivos?${params}`);
      const data = await response.json();
      
      this.renderizarArchivos(data.archivos);
      this.renderizarPaginacion(data.total);
    } catch (error) {
      console.error('Error:', error);
      container.innerHTML = '<div class="empty-state"><h3>Error al cargar archivos</h3></div>';
    }
  }

  async buscarArchivos(query) {
    if (!query.trim()) {
      this.cargarArchivos();
      return;
    }
    
    const container = document.getElementById('archivos-list');
    container.innerHTML = '<div class="loading">Buscando...</div>';
    
    try {
      const response = await fetch(`${this.apiUrl}/archivos/buscar/${encodeURIComponent(query)}`);
      const archivos = await response.json();
      this.renderizarArchivos(archivos);
      document.getElementById('pagination').innerHTML = '';
    } catch (error) {
      console.error('Error:', error);
      container.innerHTML = '<div class="empty-state"><h3>Error en la busqueda</h3></div>';
    }
  }

  async eliminarArchivo(id) {
    if (!confirm('Seguro que deseas eliminar este archivo?')) return;
    
    try {
      const response = await fetch(`${this.apiUrl}/archivos/${id}`, { 
        method: 'DELETE' 
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.mostrarNotificacion('Archivo eliminado correctamente', 'success');
        this.cargarArchivos();
        this.cargarEstadisticas();
      } else {
        this.mostrarNotificacion(data.error || 'Error al eliminar', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      this.mostrarNotificacion('Error al eliminar archivo', 'error');
    }
  }

  previewArchivo(id, tipo, nombre) {
    if (tipo.includes('pdf')) {
      this.previewPDF(id, nombre);
    } else if (tipo.includes('image')) {
      this.previewImagen(id, nombre);
    } else {
      this.descargarArchivo(id);
    }
  }

  previewPDF(id, nombre) {
    const modal = document.createElement('div');
    modal.className = 'modal-preview';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${this.escapeHtml(nombre)}</h3>
          <button class="btn-close" onclick="this.closest('.modal-preview').remove()">X</button>
        </div>
        <div class="modal-body">
          <iframe src="/api/archivos/preview/${id}" width="100%" height="600px"></iframe>
        </div>
        <div class="modal-footer">
          <button onclick="app.descargarArchivo(${id})" class="btn-primary">Descargar</button>
          <button onclick="this.closest('.modal-preview').remove()" class="btn-secondary">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  previewImagen(id, nombre) {
    const modal = document.createElement('div');
    modal.className = 'modal-preview';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${this.escapeHtml(nombre)}</h3>
          <button class="btn-close" onclick="this.closest('.modal-preview').remove()">X</button>
        </div>
        <div class="modal-body">
          <img src="/api/archivos/preview/${id}" style="max-width: 100%; height: auto;">
        </div>
        <div class="modal-footer">
          <button onclick="app.descargarArchivo(${id})" class="btn-primary">Descargar</button>
          <button onclick="this.closest('.modal-preview').remove()" class="btn-secondary">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  descargarArchivo(id) {
    window.location.href = `/api/archivos/descargar/${id}`;
  }

  async cargarEstadisticas() {
    try {
      const response = await fetch(`${this.apiUrl}/estadisticas`);
      const stats = await response.json();
      
      document.getElementById('totalArchivos').textContent = stats.total_archivos || 0;
      document.getElementById('espacioTotal').textContent = stats.tamano_total_mb + ' MB';
      
      const statsContainer = document.getElementById('categoriaStats');
      statsContainer.innerHTML = stats.por_categoria.map(cat => `
        <p>${this.capitalize(cat.categoria)}: <strong>${cat.cantidad}</strong></p>
      `).join('');
    } catch (error) {
      console.error('Error al cargar estadisticas:', error);
    }
  }

  renderizarArchivos(archivos) {
    const container = document.getElementById('archivos-list');
    
    if (archivos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No hay archivos para mostrar</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = archivos.map(archivo => {
      const icon = this.getFileIcon(archivo.tipo);
      const fecha = new Date(archivo.fecha).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const size = (archivo.size / 1024).toFixed(2);
      
      const puedePrevisualizar = archivo.tipo.includes('pdf') || archivo.tipo.includes('image');
      
      return `
        <div class="archivo-item">
          <div class="archivo-icon">${icon}</div>
          <div class="archivo-info">
            <h3 title="${this.escapeHtml(archivo.nombre_original)}">${this.escapeHtml(archivo.nombre_original)}</h3>
            <p>${this.escapeHtml(archivo.descripcion || 'Sin descripcion')}</p>
            <div class="archivo-meta">
              <span>${size} KB</span>
              <span>${fecha}</span>
            </div>
            <span class="archivo-categoria">${this.capitalize(archivo.categoria)}</span>
          </div>
          <div class="archivo-actions">
            ${puedePrevisualizar ? `
              <button onclick="app.previewArchivo(${archivo.id}, '${archivo.tipo}', '${this.escapeHtml(archivo.nombre_original)}')" title="Vista previa">
                Ver
              </button>
            ` : ''}
            <button onclick="app.descargarArchivo(${archivo.id})" title="Descargar archivo">
              Descargar
            </button>
            <button onclick="app.eliminarArchivo(${archivo.id})" class="btn-danger" title="Eliminar archivo">
              Eliminar
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderizarPaginacion(total) {
    const totalPages = Math.ceil(total / this.itemsPerPage);
    const container = document.getElementById('pagination');
    
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }
    
    let html = '';
    
    html += `<button onclick="app.cambiarPagina(${this.currentPage - 1})" 
             ${this.currentPage === 1 ? 'disabled' : ''}>Anterior</button>`;
    
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= this.currentPage - 2 && i <= this.currentPage + 2)) {
        html += `<button onclick="app.cambiarPagina(${i})" 
                 class="${i === this.currentPage ? 'active' : ''}">${i}</button>`;
      } else if (i === this.currentPage - 3 || i === this.currentPage + 3) {
        html += '<button disabled>...</button>';
      }
    }
    
    html += `<button onclick="app.cambiarPagina(${this.currentPage + 1})" 
             ${this.currentPage === totalPages ? 'disabled' : ''}>Siguiente</button>`;
    
    container.innerHTML = html;
  }

  cambiarPagina(page) {
    this.currentPage = page;
    this.cargarArchivos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  getFileIcon(mimetype) {
    if (!mimetype) return '[?]';
    if (mimetype.includes('pdf')) return '[PDF]';
    if (mimetype.includes('image')) return '[IMG]';
    if (mimetype.includes('word')) return '[DOC]';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return '[XLS]';
    if (mimetype.includes('zip') || mimetype.includes('rar')) return '[ZIP]';
    return '[FILE]';
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text ? text.replace(/[&<>"']/g, m => map[m]) : '';
  }

  mostrarNotificacion(mensaje, tipo) {
    const notification = document.getElementById('notification');
    notification.textContent = mensaje;
    notification.className = `notification ${tipo} show`;
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }
}

const app = new ArchivoManager();