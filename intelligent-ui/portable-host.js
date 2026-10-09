/* A generic host for the original DIL runtime. No per-answer calculations live here. */
class PortableHost {
  constructor(bundle, onChange = () => {}, hostActions = {}) {
    this.nodes = new Map([[0, {id: 0, type: 'root', props: {}, children: []}]]);
    this.bundle = bundle;
    this.onChange = onChange;
    this.errors = [];
    this.runner = new PortableDIL.Runner(bundle.code, {
      data: {constants: bundle.constants, appData: bundle.appData},
      // These three host widgets resolve to generic native elements. Their surrounding logic is original.
      dilComponents: {
        AsyncImage: '(p)=>__dil.jsx("portable-image",p)',
        Cite: '(p)=>__dil.jsx("portable-cite",p)',
        Link: '(p)=>__dil.jsx("portable-link",p,...(p.children??[]))',
      },
      globals: {GenUI: hostActions},
      onError: error => { this.errors.push(String(error?.message || error)); onChange(this); },
      onOperations: operations => {
        this.types = operations.types;
        PortableDIL.apply(operations, this, {
          resolveFunction: id => (...args) => this.runner.invokeFunction(id, args, true),
          resolveType: id => operations.types[id - 1],
          resolveHtmlViewMessenger: id => ({unsupportedMessenger: id}),
        });
        onChange(this);
      },
    });
  }
  onElementNodeCreated(id, typeId) { this.nodes.set(id, {id, type: this.types[typeId - 1], props: {}, children: []}); }
  onTextNodeCreated(id, text) { this.nodes.set(id, {id, type: '#text', text, props: {}, children: []}); }
  detach(id) {
    for (const n of this.nodes.values()) {
      const i = n.children.indexOf(id);
      if (i !== -1) n.children.splice(i, 1);
    }
  }
  onNodeDestroyed(id) { this.detach(id); this.nodes.delete(id); }
  onNodeMoved(id, parent, index) { this.detach(id); this.nodes.get(parent).children.splice(index, 0, id); }
  onNodePropChanged(id, name, value) { this.nodes.get(id).props[name] = value; }
  onTextNodeChanged(id, text) { this.nodes.get(id).text = text; }
  onNodeOpaqueChildrenChanged(id, children) { this.nodes.get(id).opaqueChildren = children; }
  text(id = 0) { const n = this.nodes.get(id); return n.type === '#text' ? n.text : n.children.map(c => this.text(c)).join(' '); }
  find(type, predicate = () => true) { return [...this.nodes.values()].filter(n => n.type === type && predicate(n)); }
}
globalThis.PortableHost = PortableHost;
