// The PPTypst utility node's body, run in the sandboxed JS-plugin context
// (no `api`, no `ui`). It does nothing but echo its `version` attribute so the
// plug-in has a registrable layer -- the real work is the PPTypst window, which
// `setup.js` opens when this node is created.
version;
