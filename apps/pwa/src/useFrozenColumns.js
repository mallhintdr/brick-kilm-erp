import { useEffect } from 'react';

// Freezes the whole column under any <th className="sticky-col"> so names stay
// visible while a table scrolls sideways. Re-applies as rows render or change.
// Lists scroll inside their own box: the title stays on top, the header rows stick right under it.
function stickHeaders(root) {
  root.querySelectorAll('.table-wrap').forEach((wrap) => {
    const table = wrap.querySelector(':scope > table');
    if (!table) return;
    const title = [...wrap.children].find((c) => c !== table && c.offsetHeight > 0);
    let top = title ? title.offsetHeight : 0;
    table.querySelectorAll(':scope > thead > tr').forEach((tr) => {
      tr.querySelectorAll(':scope > th').forEach((th) => { th.style.top = `${top}px`; });
      top += tr.offsetHeight;
    });
  });
}

// Phones show list tables as cards: each cell gets its column name, filter boxes get it as a hint.
function labelCells(root) {
  root.querySelectorAll('.stack-wrap table').forEach((table) => {
    const head = table.querySelector(':scope > thead > tr');
    if (!head) return;
    const names = [...head.children].map((th) => th.textContent.trim());
    table.querySelectorAll(':scope > tbody > tr, :scope > tfoot > tr').forEach((tr) => {
      let col = 0;
      [...tr.children].forEach((td) => {
        if (td.dataset.label !== names[col]) td.dataset.label = names[col] || '';
        col += Number(td.getAttribute('colspan') || 1);
      });
    });
    const filters = table.querySelector(':scope > thead > tr.filter-row');
    if (filters) [...filters.children].forEach((th, i) => { const inp = th.querySelector('input,select'); if (inp && !inp.placeholder && names[i]) inp.placeholder = names[i]; });
  });
}

function apply(root) {
  stickHeaders(root);
  labelCells(root);
  root.querySelectorAll('table').forEach((table) => {
    const head = table.querySelector('thead tr th.sticky-col');
    if (!head) return;
    const idx = Array.prototype.indexOf.call(head.parentElement.children, head);
    table.querySelectorAll('tr').forEach((tr) => {
      const cell = tr.children[idx];
      if (cell && !cell.classList.contains('sticky-col') && !cell.hasAttribute('colspan')) cell.classList.add('sticky-col');
    });
  });
}

export function useFrozenColumns(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let queued = false;
    const run = () => { queued = false; apply(root); };
    run();
    const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } });
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [ref]);
}
