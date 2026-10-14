// Used on both the source DOM and the portable DOM so section ordering agrees.
function intelligentUIContentSections(root) {
    const controls = 'form, input, select, textarea, button, [role="slider"], [role="checkbox"], [role="radio"], [role="tab"], [data-d-component="carousel"], [data-d-component="segmented-control"]';
    const primitive = node => {
        if (node.nodeType === 3) return true;
        if (node.nodeType !== 1) return true;
        if (node.matches('[data-code-block="true"], [data-markdown-copy="code-block"]')) return true;
        const type = node.getAttribute('data-d-component') || node.tagName.toLowerCase();
        if (!['text','title','caption','table','divider','math','code','blockquote','p','h1','h2','h3','h4','h5','h6','pre','hr','ul','ol'].includes(type)) return false;
        return ![...(node.matches(controls) ? [node] : []), ...node.querySelectorAll(controls)]
            .some(control => !control.closest('[data-d-component="popover-trigger"], [data-markdown-copy="exclude"], pre, [data-code-block="true"]'));
    };
    const flatten = node => {
        const children = [...node.childNodes].filter(child => child.nodeType !== 3 || child.textContent.trim());
        // A plain column wrapping prose and widgets can be split; cards keep their layout.
        if (node.getAttribute?.('data-d-component') === 'box' && !/(?:^|;)\s*(?:border(?:-[\w-]+)?|background(?:-[\w-]+)?|padding(?:-[\w-]+)?)\s*:/.test(node.getAttribute('style') || '') && children.some(child => primitive(child) && child.nodeType === 1) && children.some(child => !primitive(child)) && !children.some(child => child.matches?.(controls))) return children.flatMap(flatten);
        return [node];
    };
    const sections = [];
    let uiIndex = 0;
    for (const node of [...root.childNodes].flatMap(flatten)) {
        if (node.nodeType === 3 && !node.textContent.trim()) continue;
        const native = primitive(node);
        if (!native && sections.at(-1)?.native === false) sections.at(-1).nodes.push(node);
        else sections.push({ native, nodes: [node], ...(!native ? { uiIndex: uiIndex++ } : {}) });
    }
    return sections;
}
