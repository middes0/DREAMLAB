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
    const label = element.type === "image" ? "Imagem" : esc(element.text);
    return `
      <div class="el ${element.type}${selected === element.id ? " sel" : ""}"
           data-element-id="${element.id}"
           style="left:${element.x}px;top:${element.y}px;width:${element.w}px;height:${element.h}px">
        ${label}
      </div>
    `;
  }

  function toolsHtml() {
    return `
      <p class="label">Elementos</p>
      <div class="tools">
        <button class="tool" data-add="text"><strong>Texto</strong><small>Título ou rótulo</small></button>
        <button class="tool" data-add="button"><strong>Botão</strong><small>Ação visual</small></button>
        <button class="tool" data-add="block"><strong>Bloco</strong><small>Container</small></button>
        <button class="tool" data-add="image"><strong>Imagem</strong><small>Placeholder</small></button>
      </div>
      <hr class="sep">
      <div class="field">
        <label>Nome do projeto</label>
        <input id="project-name" value="${esc(project.name)}">
      </div>
      <button class="danger" id="delete-project">Excluir projeto</button>
    `;
  }

  function selectedHtml() {
    const element = screen.elements.find((item) => item.id === selected);
    if (!element) return toolsHtml();

    return `
      <p class="label">Elemento selecionado</p>
      <div class="field"><label>Texto</label><input id="prop-text" value="${esc(element.text)}"></div>
      <div class="field"><label>Posição X</label><input id="prop-x" type="number" value="${element.x}"></div>
      <div class="field"><label>Posição Y</label><input id="prop-y" type="number" value="${element.y}"></div>
      <div class="field"><label>Largura</label><input id="prop-w" type="number" value="${element.w}"></div>
      <div class="field"><label>Altura</label><input id="prop-h" type="number" value="${element.h}"></div>
      <button class="danger" id="delete-element">Excluir elemento</button>
    `;
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

              <div class="canvaswrap">
                <div class="canvas" id="canvas">${elementsHtml}</div>
              </div>
            </section>

            <aside class="inspector ${inspectorOpen ? "open" : ""}" id="inspector">
              ${selectedHtml()}
            </aside>
          </main>
        </div>

        <nav class="mobile">
          <button id="mobile-elements">Elementos</button>
          <button id="mobile-properties" class="active">Propriedades</button>
        </nav>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    document.querySelectorAll("[data-project-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const found = projects.find((item) => item.id === button.dataset.projectId);
        if (!found) return;
        project = found;
        screen = project.screens[0];
        selected = null;
        render();
      });
    });

    document.querySelectorAll("[data-screen-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const found = project.screens.find((item) => item.id === button.dataset.screenId);
        if (!found) return;
        screen = found;
        selected = null;
        render();
      });
    });

    document.querySelectorAll("[data-add]").forEach((button) => {
      button.addEventListener("click", () => addElement(button.dataset.add));
    });

    document.querySelectorAll("[data-element-id]").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        selected = node.dataset.elementId;
        render();
      });
      enableDrag(node);
    });

    const canvas = $("#canvas");
    if (canvas) {
      canvas.addEventListener("click", () => {
        selected = null;
        render();
      });
    }

    $("#new-project")?.addEventListener("click", createProject);
    $("#new-screen")?.addEventListener("click", createScreen);
    $("#save")?.addEventListener("click", () => { save(); flash("Salvo"); });
    $("#preview")?.addEventListener("click", openPreview);

    $("#mobile-elements")?.addEventListener("click", () => {
      selected = null;
      inspectorOpen = true;
      render();
    });

    $("#mobile-properties")?.addEventListener("click", () => {
      inspectorOpen = !inspectorOpen;
      render();
    });

    const projectName = $("#project-name");
    projectName?.addEventListener("change", () => {
      project.name = projectName.value.trim() || "Sem nome";
      save();
      render();
    });

    $("#delete-project")?.addEventListener("click", deleteProject);
    $("#delete-element")?.addEventListener("click", deleteElement);

    [["prop-text", "text"], ["prop-x", "x"], ["prop-y", "y"], ["prop-w", "w"], ["prop-h", "h"]]
      .forEach(([id, key]) => {
        const input = $("#" + id);
        input?.addEventListener("input", () => updateElement(key, input.value));
      });
  }

  function addElement(type) {
    const element = {
      id: uid(),
      type,
      x: 24,
      y: 24 + screen.elements.length * 55,
      w: type === "text" ? 150 : type === "button" ? 120 : 180,
      h: type === "text" ? 45 : type === "button" ? 48 : 100,
      text: type === "text" ? "Texto" : type === "button" ? "Botão" : ""
    };
    screen.elements.push(element);
    selected = element.id;
    save();
    render();
  }

  function updateElement(key, value) {
    const element = screen.elements.find((item) => item.id === selected);
    if (!element) return;

    if (key === "text") element.text = value;
    if (key === "x") element.x = Math.max(0, Number(value) || 0);
    if (key === "y") element.y = Math.max(0, Number(value) || 0);
    if (key === "w") element.w = Math.max(30, Number(value) || 30);
    if (key === "h") element.h = Math.max(25, Number(value) || 25);

    save();
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
      selected = element.id;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      originX = element.x;
      originY = element.y;
      node.setPointerCapture?.(event.pointerId);
    });

    node.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const element = screen.elements.find((item) => item.id === node.dataset.elementId);
      if (!element) return;

      element.x = Math.max(0, originX + event.clientX - startX);
      element.y = Math.max(0, originY + event.clientY - startY);
      node.style.left = element.x + "px";
      node.style.top = element.y + "px";
    });

    const stop = () => {
      if (!dragging) return;
      dragging = false;
      save();
    };

    node.addEventListener("pointerup", stop);
    node.addEventListener("pointercancel", stop);
  }

  function createProject() {
    const name = window.prompt("Nome do projeto:", "Novo projeto");
    if (!name) return;

    project = {
      id: uid(),
      name: name.trim() || "Novo projeto",
      screens: [{ id: uid(), name: "Tela inicial", elements: [] }]
    };
    projects.unshift(project);
    screen = project.screens[0];
    selected = null;
    save();
    render();
  }

  function createScreen() {
    const name = window.prompt("Nome da tela:", "Nova tela");
    if (!name) return;

    screen = { id: uid(), name: name.trim() || "Nova tela", elements: [] };
    project.screens.push(screen);
    selected = null;
    save();
    render();
  }

  function deleteElement() {
    screen.elements = screen.elements.filter((item) => item.id !== selected);
    selected = null;
    save();
    render();
  }

  function deleteProject() {
    if (projects.length === 1) {
      window.alert("Mantenha pelo menos um projeto.");
      return;
    }

    if (!window.confirm("Excluir este projeto?")) return;

    projects = projects.filter((item) => item.id !== project.id);
    project = projects[0];
    screen = project.screens[0];
    selected = null;
    save();
    render();
  }

  function openPreview() {
    const popup = window.open("", "_blank");
    if (!popup) {
      window.alert("Permita pop-ups para abrir a prévia.");
      return;
    }

    const content = screen.elements.map((element) => `
      <div class="preview-element ${element.type}"
           style="left:${element.x}px;top:${element.y}px;width:${element.w}px;height:${element.h}px">
        ${element.type === "image" ? "Imagem" : esc(element.text)}
      </div>
    `).join("");

    popup.document.write(`
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>DREAMLAB — Prévia</title>
        <style>
          *{box-sizing:border-box}
          body{margin:0;background:#111;display:grid;place-items:center;min-height:100vh;font-family:system-ui}
          .preview{position:relative;width:390px;height:700px;max-width:92vw;max-height:88vh;background:#f6f4ff;border-radius:20px;overflow:hidden;color:#111}
          .preview-element{position:absolute;padding:7px}
          .preview-element.button{background:#6f5be8;color:#fff;border-radius:10px;font-weight:700}
          .preview-element.block{background:#ddd8ff;border-radius:14px}
          .preview-element.image{background:#ccc;border-radius:12px;display:grid;place-items:center}
        </style>
      </head>
      <body><div class="preview">${content}</div></body>
      </html>
    `);
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