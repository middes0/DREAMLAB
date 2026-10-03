(() => {
  "use strict";

  const STORAGE_KEY = "dreamlab_projects_v2";

  const uid = () => Math.random().toString(36).slice(2, 9);
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

  const defaultProject = () => ({
    id: uid(),
    name: "Meu primeiro projeto",
    screens: [{
      id: uid(),
      name: "Tela inicial",
      elements: []
    }]
  });

  function loadProjects() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [defaultProject()];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return [defaultProject()];
      return parsed.filter((p) => p && p.id && Array.isArray(p.screens) && p.screens.length);
    } catch {
      return [defaultProject()];
    }
  }

  let projects = loadProjects();
  let project = projects[0];
  let screen = project.screens[0];
  let selected = null;
  let inspectorOpen = false;

  let panelMode = "properties";
  let zoom = 0.84;
  let undoStack = [];
  let redoStack = [];
  let historyInput = "";

  const CANVAS_W = 390;
  const CANVAS_H = 700;
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function stylesFor(element) {
    const type = element.type;
    return Object.assign({
      fontSize: type === "text" ? 18 : 16,
      color: type === "button" ? "#ffffff" : "#15131d",
      background: type === "button" ? "#6f5be8" : type === "block" ? "#ddd8ff" : type === "image" ? "#dedbe8" : "transparent",
      borderColor: "#765eff",
      borderWidth: 0,
      borderRadius: type === "button" ? 10 : type === "block" ? 14 : type === "image" ? 12 : 6,
      opacity: 1,
      textAlign: "left",
      fontWeight: type === "text" ? 650 : 500,
      shadow: "none"
    }, element.styles || {});
  }

  function snapshot() {
    undoStack.push(clone(projects));
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(clone(projects));
    projects = clone(undoStack.pop());
    project = projects.find((item) => item.id === project.id) || projects[0];
    screen = project.screens.find((item) => item.id === screen.id) || project.screens[0];
    selected = screen.elements.some((item) => item.id === selected) ? selected : null;
    save();
    render();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(clone(projects));
    projects = clone(redoStack.pop());
    project = projects.find((item) => item.id === project.id) || projects[0];
    screen = project.screens.find((item) => item.id === screen.id) || project.screens[0];
    selected = screen.elements.some((item) => item.id === selected) ? selected : null;
    save();
    render();
  }

  function commit(action, shouldRender = true) {
    snapshot();
    action();
    save();
    if (shouldRender) render();
  }

  function setZoom(value) {
    zoom = Math.max(0.55, Math.min(1.35, Math.round(value * 100) / 100));
    render();
  }

  function fitCanvas() {
    const wrap = $("#canvaswrap");
    if (!wrap) return;
    const availableW = Math.max(280, wrap.clientWidth - 32);
    const availableH = Math.max(500, wrap.clientHeight - 32);
    setZoom(Math.min(1.1, availableW / CANVAS_W, availableH / CANVAS_H));
  }

  function elementCss(element) {
    const s = stylesFor(element);
    const index = Math.max(0, screen.elements.findIndex((item) => item.id === element.id));
    return [
      "left:" + element.x + "px",
      "top:" + element.y + "px",
      "width:" + element.w + "px",
      "height:" + element.h + "px",
      "font-size:" + (Number(s.fontSize) || 16) + "px",
      "color:" + esc(s.color),
      "background:" + esc(s.background),
      "border:" + (Number(s.borderWidth) || 0) + "px solid " + esc(s.borderColor),
      "border-radius:" + (Number(s.borderRadius) || 0) + "px",
      "opacity:" + Math.max(0, Math.min(1, Number(s.opacity ?? 1))),
      "text-align:" + (["left","center","right"].includes(s.textAlign) ? s.textAlign : "left"),
      "font-weight:" + (Number(s.fontWeight) || 500),
      "box-shadow:" + (s.shadow === "soft" ? "0 10px 24px #0002" : s.shadow === "strong" ? "0 16px 32px #0004" : "none"),
      "z-index:" + (index + 1)
    ].join(";");
  }

  function refreshElement(element) {
    const node = document.querySelector('[data-element-id="' + CSS.escape(element.id) + '"]');
    if (!node) return;
    node.setAttribute("style", elementCss(element));
    if (element.type === "image") {
      node.innerHTML = element.imageUrl
        ? '<img src="' + esc(element.imageUrl) + '" alt="" draggable="false">'
        : "<span>Imagem</span>";
    } else {
      node.textContent = element.text;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {
      // O editor continua funcionando mesmo sem armazenamento local.
    }
  }

  function flash(message) {
    const button = $("#save");
    if (!button) return;
    const old = button.textContent;
    button.textContent = message;
    setTimeout(() => {
      if (button.isConnected) button.textContent = old;
    }, 900);
  }

  function elementHtml(element) {
    const content = element.type === "image"
      ? (element.imageUrl
        ? '<img src="' + esc(element.imageUrl) + '" alt="" draggable="false">'
        : "<span>Imagem</span>")
      : esc(element.text);
    return '<div class="el ' + element.type + (selected === element.id ? " sel" : "") +
      '" data-element-id="' + element.id + '" style="' + elementCss(element) + '">' + content + "</div>";
  }

  function toolsHtml() {
    return '<div class="inspector-head"><div><p class="label">Elementos</p><h3>Construir tela</h3></div><button class="iconbtn" id="close-inspector" title="Fechar">×</button></div>' +
      '<div class="tools">' +
      '<button class="tool" data-add="text"><span class="tool-icon">T</span><strong>Texto</strong><small>Título ou rótulo</small></button>' +
      '<button class="tool" data-add="button"><span class="tool-icon">↳</span><strong>Botão</strong><small>Ação e navegação</small></button>' +
      '<button class="tool" data-add="block"><span class="tool-icon">▦</span><strong>Bloco</strong><small>Container</small></button>' +
      '<button class="tool" data-add="image"><span class="tool-icon">▧</span><strong>Imagem</strong><small>URL opcional</small></button></div>' +
      '<div class="quick-row"><button class="smallbtn" id="new-text">+ Texto</button><button class="smallbtn" id="new-button">+ Botão</button></div>' +
      '<hr class="sep">' +
      '<div class="field"><label>Nome do projeto</label><input id="project-name" value="' + esc(project.name) + '"></div>' +
      '<div class="project-actions"><button class="smallbtn" id="rename-screen">Renomear tela</button><button class="danger" id="delete-screen">Excluir tela</button></div>' +
      '<hr class="sep"><button class="danger full" id="delete-project">Excluir projeto</button>';
  }

  function selectedHtml() {
    const element = screen.elements.find((item) => item.id === selected);
    if (!element) return toolsHtml();
    const s = stylesFor(element);
    const optionList = '<option value="">Nenhuma ação</option>' +
      project.screens.map((item) => '<option value="' + item.id + '"' +
        (item.id === element.linkScreenId ? " selected" : "") + '>Abrir: ' + esc(item.name) + "</option>").join("");

    return '<div class="inspector-head"><div><p class="label">Inspector</p><h3>Elemento selecionado</h3></div><button class="iconbtn" id="close-inspector" title="Fechar">×</button></div>' +
      '<div class="field"><label>Texto</label><input id="prop-text" value="' + esc(element.text) + '"></div>' +
      '<div class="inspector-grid two">' +
      '<div class="field"><label>X</label><input id="prop-x" type="number" value="' + element.x + '"></div>' +
      '<div class="field"><label>Y</label><input id="prop-y" type="number" value="' + element.y + '"></div>' +
      '<div class="field"><label>Largura</label><input id="prop-w" type="number" value="' + element.w + '"></div>' +
      '<div class="field"><label>Altura</label><input id="prop-h" type="number" value="' + element.h + '"></div>' +
      '<div class="field"><label>Fonte</label><input id="prop-font" type="number" min="8" max="120" value="' + (Number(s.fontSize) || 16) + '"></div>' +
      '<div class="field"><label>Peso</label><select id="prop-weight">' +
        '<option value="400"' + (Number(s.fontWeight) === 400 ? " selected" : "") + '>Normal</option>' +
        '<option value="500"' + (Number(s.fontWeight) === 500 ? " selected" : "") + '>Média</option>' +
        '<option value="650"' + (Number(s.fontWeight) === 650 ? " selected" : "") + '>Semibold</option>' +
        '<option value="700"' + (Number(s.fontWeight) === 700 ? " selected" : "") + '>Negrito</option>' +
        '<option value="800"' + (Number(s.fontWeight) === 800 ? " selected" : "") + '>Extra</option></select></div>' +
      '<div class="field"><label>Cor do texto</label><input id="prop-color" type="color" value="' + (validHex(s.color) ? s.color : "#15131d") + '"></div>' +
      '<div class="field"><label>Cor da borda</label><input id="prop-border-color" type="color" value="' + (validHex(s.borderColor) ? s.borderColor : "#765eff") + '"></div>' +
      '<div class="field span2"><label>Fundo</label><input id="prop-bg" value="' + esc(s.background) + '" placeholder="#ffffff ou transparent"></div>' +
      '<div class="field"><label>Raio</label><input id="prop-radius" type="number" min="0" max="80" value="' + (Number(s.borderRadius) || 0) + '"></div>' +
      '<div class="field"><label>Borda</label><input id="prop-border" type="number" min="0" max="12" value="' + (Number(s.borderWidth) || 0) + '"></div>' +
      '<div class="field"><label>Opacidade</label><input id="prop-opacity" type="number" min="0" max="1" step="0.05" value="' + Number(s.opacity ?? 1) + '"></div>' +
      '<div class="field"><label>Alinhamento</label><select id="prop-align"><option value="left"' + (s.textAlign === "left" ? " selected" : "") + '>Esquerda</option><option value="center"' + (s.textAlign === "center" ? " selected" : "") + '>Centro</option><option value="right"' + (s.textAlign === "right" ? " selected" : "") + '>Direita</option></select></div>' +
      '<div class="field"><label>Sombra</label><select id="prop-shadow"><option value="none"' + (s.shadow === "none" ? " selected" : "") + '>Nenhuma</option><option value="soft"' + (s.shadow === "soft" ? " selected" : "") + '>Suave</option><option value="strong"' + (s.shadow === "strong" ? " selected" : "") + '>Forte</option></select></div>' +
      (element.type === "image" ? '<div class="field span2"><label>URL da imagem</label><input id="prop-image" value="' + esc(element.imageUrl || "") + '" placeholder="https://..."></div>' : "") +
      (element.type === "button" ? '<div class="field span2"><label>Ação ao tocar</label><select id="prop-link">' + optionList + '</select></div>' : "") +
      '</div>' +
      '<div class="action-grid"><button class="smallbtn" id="duplicate-element">Duplicar</button><button class="smallbtn" id="bring-front">Trazer frente</button><button class="smallbtn" id="send-back">Enviar trás</button><button class="danger" id="delete-element">Excluir</button></div>';
  }

  function validHex(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ""));
  }

  function render() {
    const appRoot = $("#app");
    if (!appRoot) return;

    const projectsHtml = projects.map((item) => `
      <button class="project ${item.id === project.id ? "active" : ""}" data-project-id="${item.id}">
        <strong>${esc(item.name)}</strong>
        <small>${item.screens.length} tela(s)</small>
      </button>
    `).join("");

    const screensHtml = project.screens.map((item) => `
      <button class="tab ${item.id === screen.id ? "active" : ""}" data-screen-id="${item.id}">
        ${esc(item.name)}
      </button>
    `).join("");

    const elementsHtml = screen.elements.length
      ? screen.elements.map(elementHtml).join("")
      : '<div class="hint"><div><strong>Canvas vazio</strong><br>Adicione um elemento pelo painel.</div></div>';

    appRoot.innerHTML = `
      <div class="shell">
        <header class="top">
          <div class="brand">DREAM<b>LAB</b></div>
          <div class="actions">
            <button class="btn icon-text" id="undo" title="Desfazer">↶ <span>Desfazer</span></button>
            <button class="btn icon-text" id="redo" title="Refazer">↷ <span>Refazer</span></button>
            <button class="btn icon-text" id="import" title="Importar projeto">↑ <span>Importar</span></button>
            <button class="btn icon-text" id="export" title="Exportar projeto">↓ <span>Exportar</span></button>
            <button class="btn" id="preview">Prévia</button>
            <button class="btn primary" id="save">Salvar</button>
          </div>
        </header>

        <div class="layout">
          <aside class="side">
            <button class="btn primary new" id="new-project">+ Novo projeto</button>
            <p class="label">Meus projetos</p>
            <div class="projects">${projectsHtml}</div>
          </aside>

          <main class="main">
            <section class="work">
              <div class="bar">
                <strong>${esc(project.name)}</strong>
                <span class="slash">/</span>
                <div class="tabs">${screensHtml}</div>
                <button class="btn" id="new-screen">+ Tela</button>
              </div>

              <div class="canvas-toolbar">
                <div class="canvas-info"><span>${screen.elements.length} elemento(s)</span><span class="dot">•</span><span>${project.screens.length} tela(s)</span></div>
                <div class="zoom-controls">
                  <button class="zoom-btn" id="zoom-out">−</button>
                  <button class="zoom-value" id="zoom-fit">${Math.round(zoom * 100)}%</button>
                  <button class="zoom-btn" id="zoom-in">+</button>
                  <button class="zoom-fit" id="zoom-auto">Ajustar</button>
                </div>
              </div>
              <div class="canvaswrap" id="canvaswrap">
                <div class="canvas-stage" style="width:${390 * zoom}px;height:${700 * zoom}px"><div class="canvas" id="canvas" style="transform:scale(${zoom})">${elementsHtml}</div></div>
              </div>
            </section>

            <aside class="inspector ${inspectorOpen ? "open" : ""}" id="inspector">
              ${panelMode === "elements" ? toolsHtml() : selectedHtml()}
            </aside>
          </main>
        </div>

        <nav class="mobile">
          <button id="mobile-elements" class="${panelMode === "elements" ? "active" : ""}">Elementos</button>
          <button id="mobile-properties" class="${panelMode === "properties" ? "active" : ""}">Propriedades</button>
        </nav>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    document.querySelectorAll("[data-project-id]").forEach((button) => button.addEventListener("click", () => {
      const found = projects.find((item) => item.id === button.dataset.projectId);
      if (!found) return;
      project = found;
      screen = project.screens[0];
      selected = null;
      panelMode = "elements";
      render();
    }));

    document.querySelectorAll("[data-screen-id]").forEach((button) => button.addEventListener("click", () => {
      screen = project.screens.find((item) => item.id === button.dataset.screenId) || screen;
      selected = null;
      render();
    }));

    document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => addElement(button.dataset.add)));

    document.querySelectorAll("[data-element-id]").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        selected = node.dataset.elementId;
        panelMode = "properties";
        inspectorOpen = true;
        render();
      });
      enableDrag(node);
    });

    $("#canvas")?.addEventListener("click", () => {
      selected = null;
      if (window.innerWidth <= 720) panelMode = "elements";
      render();
    });

    $("#new-project")?.addEventListener("click", createProject);
    $("#new-screen")?.addEventListener("click", createScreen);
    $("#save")?.addEventListener("click", () => { save(); flash("Salvo ✓"); });
    $("#preview")?.addEventListener("click", openPreview);
    $("#undo")?.addEventListener("click", undo);
    $("#redo")?.addEventListener("click", redo);
    $("#export")?.addEventListener("click", exportProject);
    $("#import")?.addEventListener("click", () => $("#import-file")?.click());
    $("#import-file")?.addEventListener("change", importProject);

    $("#zoom-out")?.addEventListener("click", () => setZoom(zoom - 0.1));
    $("#zoom-in")?.addEventListener("click", () => setZoom(zoom + 0.1));
    $("#zoom-fit")?.addEventListener("click", fitCanvas);
    $("#zoom-auto")?.addEventListener("click", fitCanvas);

    $("#mobile-elements")?.addEventListener("click", () => { inspectorOpen = true; panelMode = "elements"; render(); });
    $("#mobile-properties")?.addEventListener("click", () => { inspectorOpen = true; panelMode = "properties"; render(); });
    $("#close-inspector")?.addEventListener("click", () => { inspectorOpen = false; render(); });
    $("#new-text")?.addEventListener("click", () => addElement("text"));
    $("#new-button")?.addEventListener("click", () => addElement("button"));

    const projectName = $("#project-name");
    projectName?.addEventListener("focus", () => { if (historyInput !== "project") { snapshot(); historyInput = "project"; } });
    projectName?.addEventListener("input", () => { project.name = projectName.value.trim() || "Sem nome"; save(); });
    projectName?.addEventListener("blur", () => { historyInput = ""; render(); });

    $("#delete-project")?.addEventListener("click", deleteProject);
    $("#delete-screen")?.addEventListener("click", deleteScreen);
    $("#rename-screen")?.addEventListener("click", renameScreen);
    $("#duplicate-element")?.addEventListener("click", duplicateElement);
    $("#bring-front")?.addEventListener("click", () => reorderElement("front"));
    $("#send-back")?.addEventListener("click", () => reorderElement("back"));
    $("#delete-element")?.addEventListener("click", deleteElement);

    const map = [
      ["prop-text", "text"], ["prop-x", "x"], ["prop-y", "y"], ["prop-w", "w"], ["prop-h", "h"],
      ["prop-font", "fontSize"], ["prop-color", "color"], ["prop-bg", "background"],
      ["prop-radius", "borderRadius"], ["prop-border", "borderWidth"], ["prop-border-color", "borderColor"],
      ["prop-opacity", "opacity"], ["prop-align", "textAlign"], ["prop-shadow", "shadow"], ["prop-weight", "fontWeight"],
      ["prop-image", "imageUrl"]
    ];

    map.forEach(([id, key]) => {
      const input = $("#" + id);
      if (!input) return;
      input.addEventListener("focus", () => {
        if (historyInput !== id) { snapshot(); historyInput = id; }
      });
      input.addEventListener("input", () => {
        let value = input.value;
        if (["fontSize","borderRadius","borderWidth","opacity","fontWeight"].includes(key)) value = Number(value);
        updateElement(key, value);
      });
      input.addEventListener("change", () => {
        if (input.tagName === "SELECT") updateElement(key, input.value);
      });
      input.addEventListener("blur", () => { historyInput = ""; });
    });

    $("#prop-link")?.addEventListener("focus", () => snapshot());
    $("#prop-link")?.addEventListener("change", (event) => {
      const element = screen.elements.find((item) => item.id === selected);
      if (!element) return;
      snapshot();
      element.linkScreenId = event.target.value;
      save();
    });

    document.onkeydown = hotkeys;
  }

  function hotkeys(event) {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateElement();
      return;
    }
  }

  function addElement(type) {
    commit(() => {
      const element = {
        id: uid(),
        type,
        x: 24,
        y: Math.min(600, 24 + screen.elements.length * 55),
        w: type === "text" ? 150 : type === "button" ? 120 : 180,
        h: type === "text" ? 45 : type === "button" ? 48 : 100,
        text: type === "text" ? "Texto" : type === "button" ? "Botão" : "",
        imageUrl: "",
        styles: stylesFor({ type }),
        linkScreenId: ""
      };
      screen.elements.push(element);
      selected = element.id;
      panelMode = "properties";
      inspectorOpen = true;
    });
  }

  function updateElement(key, value) {
    const element = screen.elements.find((item) => item.id === selected);
    if (!element) return;

    if (["fontSize","borderRadius","borderWidth","opacity","fontWeight","color","background","borderColor","textAlign","shadow"].includes(key)) {
      element.styles = stylesFor(element);
      element.styles[key] = value;
    } else if (key === "text") {
      element.text = value;
    } else if (key === "imageUrl") {
      element.imageUrl = String(value || "");
    } else if (["x","y","w","h"].includes(key)) {
      const min = key === "w" ? 30 : key === "h" ? 25 : 0;
      element[key] = Math.max(min, Number(value) || min);
    }

    save();
    refreshElement(element);
  }

  function enableDrag(node) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    node.addEventListener("pointerdown", (event) => {
      const element = screen.elements.find((item) => item.id === node.dataset.elementId);
      if (!element) return;
      event.stopPropagation();
      snapshot();
      selected = element.id;
      panelMode = "properties";
      inspectorOpen = true;
      startX = event.clientX;
      startY = event.clientY;
      originX = element.x;
      originY = element.y;
      dragging = true;
      node.setPointerCapture?.(event.pointerId);
    });

    node.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const element = screen.elements.find((item) => item.id === node.dataset.elementId);
      if (!element) return;
      element.x = Math.max(0, Math.min(CANVAS_W - 30, originX + (event.clientX - startX) / zoom));
      element.y = Math.max(0, Math.min(CANVAS_H - 25, originY + (event.clientY - startY) / zoom));
      node.style.left = element.x + "px";
      node.style.top = element.y + "px";
    });

    const stop = () => {
      if (!dragging) return;
      dragging = false;
      save();
      render();
    };
    node.addEventListener("pointerup", stop);
    node.addEventListener("pointercancel", stop);
  }

  function createProject() {
    const name = window.prompt("Nome do projeto:", "Novo projeto");
    if (!name) return;
    commit(() => {
      project = { id: uid(), name: name.trim() || "Novo projeto", screens: [{ id: uid(), name: "Tela inicial", elements: [] }] };
      projects.unshift(project);
      screen = project.screens[0];
      selected = null;
      panelMode = "elements";
    });
  }

  function createScreen() {
    const name = window.prompt("Nome da tela:", "Nova tela");
    if (!name) return;
    commit(() => {
      screen = { id: uid(), name: name.trim() || "Nova tela", elements: [] };
      project.screens.push(screen);
      selected = null;
    });
  }

  function renameScreen() {
    const name = window.prompt("Nome da tela:", screen.name);
    if (!name) return;
    commit(() => { screen.name = name.trim() || screen.name; });
  }

  function deleteScreen() {
    if (project.screens.length === 1) {
      window.alert("Mantenha pelo menos uma tela no projeto.");
      return;
    }
    if (!window.confirm("Excluir esta tela?")) return;
    commit(() => {
      project.screens = project.screens.filter((item) => item.id !== screen.id);
      screen = project.screens[0];
      selected = null;
    });
  }

  function duplicateElement() {
    const element = screen.elements.find((item) => item.id === selected);
    if (!element) return;
    commit(() => {
      const copy = clone(element);
      copy.id = uid();
      copy.x = Math.min(CANVAS_W - 40, copy.x + 18);
      copy.y = Math.min(CANVAS_H - 30, copy.y + 18);
      screen.elements.push(copy);
      selected = copy.id;
    });
  }

  function reorderElement(direction) {
    const index = screen.elements.findIndex((item) => item.id === selected);
    if (index < 0) return;
    commit(() => {
      const item = screen.elements.splice(index, 1)[0];
      direction === "front" ? screen.elements.push(item) : screen.elements.unshift(item);
    });
  }

  function deleteElement() {
    if (!selected) return;
    commit(() => {
      screen.elements = screen.elements.filter((item) => item.id !== selected);
      selected = null;
      panelMode = "elements";
    });
  }

  function deleteProject() {
    if (projects.length === 1) {
      window.alert("Mantenha pelo menos um projeto.");
      return;
    }
    if (!window.confirm("Excluir este projeto?")) return;
    commit(() => {
      projects = projects.filter((item) => item.id !== project.id);
      project = projects[0];
      screen = project.screens[0];
      selected = null;
      panelMode = "elements";
    });
  }

  function exportProject() {
    const payload = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), projects }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dreamlab-projeto.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    flash("Exportado ✓");
  }

  function importProject(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || ""));
        const list = Array.isArray(raw) ? raw : raw.projects;
        if (!Array.isArray(list)) throw new Error("Projeto inválido");
        const imported = list.filter((item) => item && item.id && Array.isArray(item.screens) && item.screens.length).map((item) => ({
          id: item.id,
          name: String(item.name || "Sem nome"),
          screens: item.screens.map((s) => ({
            id: s.id || uid(),
            name: String(s.name || "Nova tela"),
            elements: Array.isArray(s.elements) ? s.elements.map((e) => Object.assign({}, e, {
              styles: stylesFor(e),
              imageUrl: e.imageUrl || "",
              linkScreenId: e.linkScreenId || ""
            })) : []
          }))
        }));
        if (!imported.length) throw new Error("Projeto inválido");
        snapshot();
        projects = imported;
        project = projects[0];
        screen = project.screens[0];
        selected = null;
        panelMode = "elements";
        save();
        render();
        flash("Importado ✓");
      } catch {
        window.alert("Não foi possível importar este arquivo.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function openPreview() {
    const popup = window.open("", "_blank");
    if (!popup) {
      window.alert("Permita pop-ups para abrir a prévia.");
      return;
    }

    const payload = JSON.stringify({ project, startScreenId: screen.id }).replace(/</g, "\\u003c");
    const html = [
      "<!doctype html><html lang='pt-BR'><head>",
      "<meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
      "<title>DREAMLAB — Prévia</title>",
      "<style>*{box-sizing:border-box}body{margin:0;background:#07070b;color:#fff;font-family:system-ui;min-height:100vh;display:grid;place-items:center;padding:20px}.wrap{width:min(430px,94vw)}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.top strong{letter-spacing:.08em}.top button{border:1px solid #353345;background:#11111a;color:#fff;border-radius:9px;padding:8px 10px}.preview{position:relative;width:390px;height:700px;max-width:100%;margin:auto;background:#f6f4ff;border-radius:24px;overflow:hidden;color:#15131d;box-shadow:0 24px 80px #000a}.screen-element{position:absolute;padding:7px;overflow:hidden;word-break:break-word}.screen-element img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit}.screen-element.button{cursor:pointer}.empty{position:absolute;inset:0;display:grid;place-items:center;color:#888;text-align:center}</style>",
      "</head><body><div class='wrap'><div class='top'><strong>DREAM<span style='color:#9b7cff'>LAB</span></strong><button id='back' hidden>← Voltar</button></div><div class='preview' id='preview'></div></div>",
      "<script>const DATA=" + payload + ";let current=DATA.startScreenId;let history=[];const root=document.getElementById('preview'),back=document.getElementById('back');",
      "const esc=(v)=>String(v??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]||c));",
      "const style=(e,i)=>{const x=e.styles||{};return ['left:'+e.x+'px','top:'+e.y+'px','width:'+e.w+'px','height:'+e.h+'px','font-size:'+(Number(x.fontSize)||16)+'px','color:'+(x.color||'#15131d'),'background:'+(x.background||'transparent'),'border:'+(Number(x.borderWidth)||0)+'px solid '+(x.borderColor||'#765eff'),'border-radius:'+(Number(x.borderRadius)||0)+'px','opacity:'+(Number(x.opacity??1)),'text-align:'+(x.textAlign||'left'),'font-weight:'+(Number(x.fontWeight)||500),'box-shadow:'+(x.shadow==='soft'?'0 10px 24px #0002':x.shadow==='strong'?'0 16px 32px #0004':'none'),'z-index:'+(i+1)].join(';')};",
      "function draw(){const s=DATA.project.screens.find(x=>x.id===current)||DATA.project.screens[0];root.innerHTML=s.elements.length?s.elements.map((e,i)=>\"<div class='screen-element \"+e.type+\"' data-id='\"+e.id+\"' style='\"+style(e,i)+\"'>\"+(e.type==='image'?(e.imageUrl?\"<img src='\"+esc(e.imageUrl)+\"' alt=''>\":'Imagem'):esc(e.text))+\"</div>\").join(''):\"<div class='empty'>Esta tela está vazia.</div>\";back.hidden=!history.length;root.querySelectorAll('.button').forEach(n=>n.addEventListener('click',()=>{const e=s.elements.find(x=>x.id===n.dataset.id);if(e&&e.linkScreenId&&DATA.project.screens.some(x=>x.id===e.linkScreenId)){history.push(current);current=e.linkScreenId;draw()}}));}",
      "back.onclick=()=>{if(history.length){current=history.pop();draw()}};draw();</script></body></html>"
    ].join("");
    popup.document.write(html);
    popup.document.close();
  }

  try {
    render();
  } catch (error) {
    const root = document.querySelector("#app");
    if (root) {
      root.innerHTML = `
        <div style="min-height:100%;display:grid;place-items:center;padding:24px;background:#08080d;color:#fff;font-family:system-ui;text-align:center">
          <div><h2 style="margin-bottom:8px">DREAMLAB</h2><p>O editor encontrou um erro ao iniciar.</p><button onclick="localStorage.removeItem('dreamlab_projects_v2');location.reload()" style="padding:10px 14px;border:0;border-radius:10px">Reiniciar editor</button></div>
        </div>
      `;
    }
    console.error("DREAMLAB startup error:", error);
  }
})();