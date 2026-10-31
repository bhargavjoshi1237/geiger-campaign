import { cloneBlock } from "@/lib/email/blocks";

// Immutable edits on a builder document ({ blocks, settings }). Blocks nest one level, inside columns.

const copy = (doc) => ({ ...doc, blocks: [...(doc?.blocks || [])] });

// Where a block lives: { block, index, siblings, parentId, columnIndex }.
export function locate(doc, id) {
  const top = doc?.blocks || [];
  const i = top.findIndex((b) => b.id === id);
  if (i >= 0) return { block: top[i], index: i, siblings: top, parentId: null, columnIndex: null };
  for (const parent of top) {
    if (parent.type !== "columns") continue;
    const cols = parent.props?.columns || [];
    for (let c = 0; c < cols.length; c += 1) {
      const j = (cols[c].blocks || []).findIndex((b) => b.id === id);
      if (j >= 0) return { block: cols[c].blocks[j], index: j, siblings: cols[c].blocks, parentId: parent.id, columnIndex: c };
    }
  }
  return null;
}

// Rewrites the sibling list that holds `id` (or the given parent/column) with fn(list) -> list.
function withSiblings(doc, { parentId, columnIndex }, fn) {
  const next = copy(doc);
  if (!parentId) {
    next.blocks = fn(next.blocks);
    return next;
  }
  next.blocks = next.blocks.map((b) => {
    if (b.id !== parentId) return b;
    const columns = (b.props?.columns || []).map((col, c) => (c === columnIndex ? { ...col, blocks: fn([...(col.blocks || [])]) } : col));
    return { ...b, props: { ...b.props, columns } };
  });
  return next;
}

export function updateBlock(doc, id, patch) {
  const at = locate(doc, id);
  if (!at) return doc;
  return withSiblings(doc, at, (list) =>
    list.map((b) => (b.id === id ? (typeof patch === "function" ? patch(b) : { ...b, ...patch, props: { ...b.props, ...(patch.props || {}) } }) : b)),
  );
}

export function updateBlockProps(doc, id, props) {
  return updateBlock(doc, id, (b) => ({ ...b, props: { ...b.props, ...props } }));
}

export function setBlockRule(doc, id, rule) {
  return updateBlock(doc, id, (b) => {
    const next = { ...b };
    if (rule) next.visibleIf = rule;
    else delete next.visibleIf;
    return next;
  });
}

export function removeBlock(doc, id) {
  const at = locate(doc, id);
  if (!at) return doc;
  return withSiblings(doc, at, (list) => list.filter((b) => b.id !== id));
}

// Inserts at `index` of the target list (top level, or a column when parentId is given).
export function insertBlock(doc, block, { index, parentId = null, columnIndex = 0 } = {}) {
  return withSiblings(doc, { parentId, columnIndex }, (list) => {
    const at = index == null ? list.length : Math.max(0, Math.min(list.length, index));
    return [...list.slice(0, at), block, ...list.slice(at)];
  });
}

// Inserts right after `afterId` in its list, or at the end of the top level.
export function insertAfter(doc, block, afterId) {
  const at = afterId ? locate(doc, afterId) : null;
  if (!at) return insertBlock(doc, block);
  // Columns can't nest; a block inserted after a nested block lands next to it only if it isn't columns.
  if (at.parentId && block.type === "columns") {
    const parent = locate(doc, at.parentId);
    return insertBlock(doc, block, { index: parent.index + 1 });
  }
  return insertBlock(doc, block, { index: at.index + 1, parentId: at.parentId, columnIndex: at.columnIndex });
}

export function moveBlock(doc, id, delta) {
  const at = locate(doc, id);
  if (!at) return doc;
  const target = at.index + delta;
  if (target < 0 || target >= at.siblings.length) return doc;
  return withSiblings(doc, at, (list) => {
    const [item] = list.splice(at.index, 1);
    list.splice(target, 0, item);
    return list;
  });
}

// Drag reorder at the top level: move `id` so it sits at `targetIndex` of the list before removal.
export function moveTopLevel(doc, id, targetIndex) {
  const from = (doc?.blocks || []).findIndex((b) => b.id === id);
  if (from < 0) return doc;
  const next = copy(doc);
  const [item] = next.blocks.splice(from, 1);
  const to = targetIndex > from ? targetIndex - 1 : targetIndex;
  next.blocks.splice(Math.max(0, Math.min(next.blocks.length, to)), 0, item);
  return next;
}

export function duplicateBlock(doc, id) {
  const at = locate(doc, id);
  if (!at) return { doc, id: null };
  const dup = cloneBlock(at.block);
  return { doc: insertBlock(doc, dup, { index: at.index + 1, parentId: at.parentId, columnIndex: at.columnIndex }), id: dup.id };
}

// Columns count change pads with empty columns; extra columns are kept (hidden) so nothing is lost.
export function setColumnCount(doc, id, count) {
  return updateBlock(doc, id, (b) => {
    const cols = [...(b.props?.columns || [])];
    while (cols.length < count) cols.push({ blocks: [] });
    return { ...b, props: { ...b.props, count, columns: cols } };
  });
}
