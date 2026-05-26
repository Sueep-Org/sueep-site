import { splitPath, joinPath, parentPath, basename } from '../lib/path.js';

export async function initFolderTree({ mountEl, listFiles, onSelectFolder, rootPrefix, initialFolder, extraFolders = [] }) {
  const expandedKey = 'AI_FOLDER_TREE_EXPANDED';
  const expanded = new Set(JSON.parse(localStorage.getItem(expandedKey) || '[]'));
  let selected = initialFolder || '';

  function persist() { localStorage.setItem(expandedKey, JSON.stringify(Array.from(expanded))); }

  function buildTreeFromFlat(flat) {
    const root = { id: rootPrefix, name: basename(rootPrefix) || 'Root', path: '', type: 'folder', children: new Map() };
    function ensurePath(parts) {
      let node = root;
      parts.forEach(seg => {
        if (!node.children.has(seg)) node.children.set(seg, { id: joinPath([node.path, seg]), name: seg, path: joinPath([node.path, seg]), type: 'folder', children: new Map() });
        node = node.children.get(seg);
      });
    }
    flat.forEach(it => {
      const rel = (it.name || '').replace(new RegExp('^'+rootPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')+'/'), '');
      const parts = splitPath(rel);
      if (parts.length < 2) return; // ignore files directly under rootPrefix without folder
      const folderParts = parts.slice(0, -1);
      ensurePath(folderParts);
    });
    // include client-side empty folders
    (extraFolders || []).forEach(p => {
      const rel = (p || '').replace(new RegExp('^'+rootPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')+'/'), '');
      const parts = splitPath(rel);
      if (parts.length) ensurePath(parts);
    });
    return root;
  }

  function renderTree(node, container) {
    container.innerHTML = '';
    const ul = document.createElement('ul'); ul.className = 'tree';
    function renderNode(n) {
      const li = document.createElement('li');
      const hasChildren = n.children && n.children.size > 0;
      const isExpanded = expanded.has(n.id);
      const btn = document.createElement('button');
      btn.className = 'node' + (selected === n.id ? ' active' : '');
      btn.setAttribute('data-id', n.id);
      btn.innerHTML = `${hasChildren ? (isExpanded ? '▼' : '▸') : '•'} <span>📂 ${n.name || 'Root'}</span>`;
      btn.addEventListener('click', (e) => {
        if (hasChildren) {
          if (expanded.has(n.id)) expanded.delete(n.id); else expanded.add(n.id);
          persist(); draw();
        }
        selected = n.id; onSelectFolder(selected); draw();
      });
      li.appendChild(btn);
      if (hasChildren && isExpanded) {
        const childUl = document.createElement('ul'); childUl.className = 'children';
        Array.from(n.children.keys()).sort().forEach(k => childUl.appendChild(renderNode(n.children.get(k))));
        li.appendChild(childUl);
      }
      return li;
    }
    ul.appendChild(renderNode(node));
    container.appendChild(ul);
  }

  function draw(tree) { renderTree(tree, mountEl); }

  // Keyboard navigation (basic)
  mountEl.tabIndex = 0;
  mountEl.addEventListener('keydown', (e) => {
    const focusables = Array.from(mountEl.querySelectorAll('.node'));
    const idx = focusables.findIndex(el => el.classList.contains('active'));
    if (e.key === 'ArrowDown') { const ni = Math.min(focusables.length-1, idx+1); focusables[ni]?.focus(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { const pi = Math.max(0, idx-1); focusables[pi]?.focus(); e.preventDefault(); }
    if (e.key === 'Enter') { const id = document.activeElement?.getAttribute('data-id'); if (id) { selected = id; onSelectFolder(selected); draw(currentTree); } }
    if (e.key === 'ArrowRight') { const id = document.activeElement?.getAttribute('data-id'); if (id && !expanded.has(id)) { expanded.add(id); persist(); draw(currentTree); } }
    if (e.key === 'ArrowLeft') { const id = document.activeElement?.getAttribute('data-id'); if (id) { if (expanded.has(id)) { expanded.delete(id); persist(); draw(currentTree); } else { const p = parentPath(id); if (p) { selected = p; onSelectFolder(selected); draw(currentTree); } } } }
  });

  let currentTree = null;
  try {
    const r = await fetch(`/api/files/tree?prefix=${encodeURIComponent(rootPrefix)}`);
    if (r.ok) {
      currentTree = await r.json();
    } else {
      throw new Error('tree endpoint not available');
    }
  } catch {
    const j = await listFiles(rootPrefix);
    const base = j.files || j.items || [];
    currentTree = buildTreeFromFlat(base);
  }

  draw(currentTree);
  return { getSelected: () => selected, setSelected: (p) => { selected = p; onSelectFolder(selected); draw(currentTree); }, rebuild: async () => { const j = await listFiles(rootPrefix); const base = j.files || j.items || []; currentTree = buildTreeFromFlat(base); draw(currentTree); } };
} 