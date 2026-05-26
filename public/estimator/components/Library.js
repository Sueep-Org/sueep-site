import { listFiles, saveFromProcessing } from '../lib/api.js';
import { getAnonId } from '../lib/anon.js';
import { humanSize, humanDate } from '../lib/library.js';
import { toast } from '../lib/toast.js';
import { initFolderTree } from './FolderTree.js';
import { splitPath } from '../lib/path.js';

export function mountLibrary(el) {
  if (!(el instanceof HTMLElement)) throw new Error('mountLibrary requires an HTMLElement');
  el.innerHTML = `
    <header class="px-3 py-3 border-b border-gray-800 flex items-center gap-2">
      <button class="icon-btn" data-close-sidebar aria-label="Close">✕</button>
      <strong>Management</strong>
    </header>
    <div id="libraryBody" class="p-3 text-sm space-y-3"></div>
  `;
  // TODO: render the existing Library list/controls into #libraryBody (reuse your current code).
} 