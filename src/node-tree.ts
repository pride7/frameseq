import type { FrameSeqNode } from "./core";

const parents = new WeakMap<FrameSeqNode, FrameSeqNode>();

function owningSlide(node: FrameSeqNode): FrameSeqNode | undefined {
  let current: FrameSeqNode | undefined = node;
  while (current) {
    if (current.type === "slide") return current;
    current = parents.get(current);
  }
  return undefined;
}

function assertCanAttach(parent: FrameSeqNode, child: FrameSeqNode): void {
  if (parent === child) throw new Error("An object cannot be its own parent");

  let ancestor: FrameSeqNode | undefined = parent;
  while (ancestor) {
    if (ancestor === child) throw new Error("parent() cannot create a cycle");
    ancestor = parents.get(ancestor);
  }

  const parentSlide = owningSlide(parent);
  const childSlide = owningSlide(child);
  if (parentSlide && childSlide && parentSlide !== childSlide) {
    throw new Error("parent() requires both objects to belong to the same slide");
  }
}

export function nodeParent(node: FrameSeqNode): FrameSeqNode | undefined {
  return parents.get(node);
}

export function detachNode(node: FrameSeqNode): void {
  const parent = parents.get(node);
  if (!parent) return;
  const index = parent.children.indexOf(node);
  if (index >= 0) parent.children.splice(index, 1);
  parents.delete(node);
}

export function attachNode(
  parent: FrameSeqNode,
  child: FrameSeqNode,
  requestedIndex?: number,
): void {
  assertCanAttach(parent, child);

  const previousParent = parents.get(child);
  const previousIndex = previousParent?.children.indexOf(child) ?? -1;
  if (previousParent === parent && requestedIndex === undefined) return;

  if (previousParent) detachNode(child);
  else {
    const duplicateIndex = parent.children.indexOf(child);
    if (duplicateIndex >= 0) parent.children.splice(duplicateIndex, 1);
  }

  let index = requestedIndex ?? parent.children.length;
  if (previousParent === parent && previousIndex >= 0 && previousIndex < index) index -= 1;
  index = Math.max(0, Math.min(index, parent.children.length));
  parent.children.splice(index, 0, child);
  parents.set(child, parent);
}

export function takeNodeChildren(parent: FrameSeqNode): FrameSeqNode[] {
  const children = parent.children.splice(0);
  for (const child of children) {
    if (parents.get(child) === parent) parents.delete(child);
  }
  return children;
}
