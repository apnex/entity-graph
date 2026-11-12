// The document world of entity-graph's neutral corpus, batches 3 and 4.
// Written from CONTRACT.md by an agent other than the implementer.
// corpus/README.md states the protocol every function here follows.
// Every function is pure: no clock, no randomness, no input or output, no import.

const shapes = {
  section: {
    type: "object",
    properties: {
      heading: { type: "string" },
      parent: { type: ["string", "null"] },
      cites: { type: "array", items: { type: "string" } },
    },
    required: ["heading", "parent", "cites"],
    additionalProperties: false,
  },
  figure: {
    type: "object",
    properties: {
      title: { type: "string" },
      section: { type: "string" },
      number: { type: "integer" },
    },
    required: ["title", "section", "number"],
    additionalProperties: false,
  },
  caption: {
    type: "object",
    properties: {
      body: { type: "string" },
      figure: { type: "string" },
    },
    required: ["body", "figure"],
    additionalProperties: false,
  },
  index: {
    type: "object",
    properties: {
      count: { type: "integer" },
    },
    required: ["count"],
    additionalProperties: false,
  },
};

function byId(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function changesById(changes) {
  return changes.slice().sort((a, b) => byId(a.id, b.id));
}

function readContext(context, member, accepts, fallback) {
  if (context !== null && typeof context === "object" && accepts(context[member])) return context[member];
  return fallback;
}

function captionBody(context, figure) {
  const prefix = readContext(context, "captionPrefix", (v) => typeof v === "string", "Figure");
  return prefix + " " + figure.number + ": " + figure.title;
}

function figuresIn(view, sectionId) {
  return view
    .all("figure")
    .slice()
    .sort(byId)
    .map((id) => ({ id, record: view.get("figure", id) }))
    .filter((f) => f.record.section === sectionId);
}

// Phase "numbering": a section that lost a figure numbers its remaining figures 1, 2, 3 in their order.
const renumber = {
  name: "renumber",
  trigger: { deleted: ["figure"] },
  phase: "numbering",
  run({ changes, view }) {
    const sections = [...new Set(changes.map((c) => c.before.section))].sort(byId);
    const writes = [];
    for (const sectionId of sections) {
      if (view.get("section", sectionId) === null) continue;
      const figures = figuresIn(view, sectionId).sort(
        (a, b) => a.record.number - b.record.number || byId(a.id, b.id),
      );
      figures.forEach((f, i) => {
        if (f.record.number !== i + 1) {
          writes.push({ op: "change", kind: "figure", id: f.id, record: { ...f.record, number: i + 1 } });
        }
      });
    }
    return writes;
  },
};

// Phase "numbering": a created figure gets the caption "cap-<figure id>", unless an entity holds that identity.
function autoCaption(extra) {
  return {
    name: "autoCaption",
    trigger: { created: ["figure"] },
    phase: "numbering",
    run({ changes, view, context }) {
      const writes = [];
      for (const c of changesById(changes)) {
        const figure = view.get("figure", c.id);
        const id = "cap-" + c.id;
        if (figure === null || view.get("caption", id) !== null) continue;
        writes.push({
          op: "create",
          kind: "caption",
          id,
          record: { body: captionBody(context, figure), figure: c.id, ...extra },
        });
      }
      return writes;
    },
  };
}

// Phase "numbering": a figure whose title or number changed has every caption holding it say so.
const retitle = {
  name: "retitle",
  trigger: { changed: { kind: "figure", fields: ["title", "number"] } },
  phase: "numbering",
  run({ changes, view, context }) {
    const writes = [];
    for (const c of changesById(changes)) {
      const figure = view.get("figure", c.id);
      if (figure === null) continue;
      const body = captionBody(context, figure);
      for (const id of view.all("caption").slice().sort(byId)) {
        const caption = view.get("caption", id);
        if (caption.figure === c.id && caption.body !== body) {
          writes.push({ op: "change", kind: "caption", id, record: { ...caption, body } });
        }
      }
    }
    return writes;
  },
};

// Variant "conflicting", phase "numbering": a figure whose title changed has its captions in capitals.
const shout = {
  name: "shout",
  trigger: { changed: { kind: "figure", fields: ["title"] } },
  phase: "numbering",
  run({ changes, view }) {
    const writes = [];
    for (const c of changesById(changes)) {
      for (const id of view.all("caption").slice().sort(byId)) {
        const caption = view.get("caption", id);
        if (caption.figure === c.id && caption.body !== caption.body.toUpperCase()) {
          writes.push({ op: "change", kind: "caption", id, record: { ...caption, body: caption.body.toUpperCase() } });
        }
      }
    }
    return writes;
  },
};

// Variant "indexed", phase "numbering": a section whose heading was emptied is removed.
const collapse = {
  name: "collapse",
  trigger: { changed: { kind: "section", fields: ["heading"] } },
  phase: "numbering",
  run({ changes, view }) {
    const writes = [];
    for (const c of changesById(changes)) {
      const section = view.get("section", c.id);
      if (section !== null && section.heading === "") writes.push({ op: "remove", kind: "section", id: c.id });
    }
    return writes;
  },
};

// Variant "indexed", phase "index": a figure whose title was emptied is removed.
const dropBlank = {
  name: "dropBlank",
  trigger: { changed: { kind: "figure", fields: ["title"] } },
  phase: "index",
  run({ changes, view }) {
    const writes = [];
    for (const c of changesById(changes)) {
      const figure = view.get("figure", c.id);
      if (figure !== null && figure.title === "") writes.push({ op: "remove", kind: "figure", id: c.id });
    }
    return writes;
  },
};

// Variant "indexed", phase "index": the index entity counts the figures once figures are deleted.
const recount = {
  name: "recount",
  trigger: { deleted: ["figure"] },
  phase: "index",
  run({ view }) {
    const count = view.all("figure").length;
    const writes = [];
    for (const id of view.all("index").slice().sort(byId)) {
      const index = view.get("index", id);
      if (index.count !== count) writes.push({ op: "change", kind: "index", id, record: { ...index, count } });
    }
    return writes;
  },
};

// The whole-set condition: a section holds at most two figures, or as many as the context's figureLimit says.
const figureLimit = {
  key: "section.figure-limit",
  check({ view, context }) {
    const limit = readContext(context, "figureLimit", (v) => Number.isInteger(v), 2);
    const breaches = [];
    for (const sectionId of view.all("section").slice().sort(byId)) {
      const count = figuresIn(view, sectionId).length;
      if (count > limit) {
        breaches.push({
          subject: sectionId,
          measure: count - limit,
          sentence: "Section " + sectionId + " holds " + count + " figures; a section holds at most " + limit + ".",
        });
      }
    }
    return breaches;
  },
};

// Variant "resolving": a figure created without an identity is named "f<n>", n one past the highest in use,
// placed in the section its record names, else the context's section, else the first section,
// and numbered one past the highest number in that section.
function placeFigure({ item, view, context }) {
  if (item.op !== "create" || typeof item.id === "string") return [item];
  const record = item.record;
  const firstSection = view.all("section").slice().sort(byId)[0];
  const section =
    typeof record.section === "string"
      ? record.section
      : readContext(context, "section", (v) => typeof v === "string", firstSection);
  let number = 1;
  for (const f of figuresIn(view, section)) {
    if (f.record.number >= number) number = f.record.number + 1;
  }
  let n = 1;
  for (const id of view.all("figure")) {
    const m = /^f(\d+)$/.exec(id);
    if (m !== null && Number(m[1]) >= n) n = Number(m[1]) + 1;
  }
  return [{ op: "create", kind: "figure", id: "f" + n, record: { title: record.title, section, number } }];
}

function declaration({
  phases,
  sectionConsequences = [],
  figureConsequences,
  captionConsequences,
  withIndex = false,
  resolver = null,
}) {
  const figure = {
    kind: "figure",
    shape: shapes.figure,
    references: [{ field: "section", targets: ["section"], holds: "one", onTargetDelete: "cascade-delete" }],
    consequences: figureConsequences,
  };
  if (resolver !== null) figure.intentResolver = resolver;
  const kinds = [
    {
      kind: "section",
      shape: shapes.section,
      references: [
        { field: "parent", targets: ["section"], holds: "one", onTargetDelete: "cascade-delete" },
        { field: "cites", targets: ["figure"], holds: "many", onTargetDelete: "refuse" },
      ],
      conditions: [figureLimit],
      consequences: sectionConsequences,
    },
    figure,
    {
      kind: "caption",
      shape: shapes.caption,
      references: [
        { field: "figure", targets: ["figure"], holds: "one", onTargetDelete: "cascade-delete", exclusivity: "refuse" },
      ],
      consequences: captionConsequences,
    },
  ];
  if (withIndex) kinds.push({ kind: "index", shape: shapes.index, references: [], consequences: [recount] });
  return { phases, kinds };
}

// One application phase, one whole-set condition.
export const base = declaration({
  phases: ["numbering"],
  figureConsequences: [renumber, autoCaption({})],
  captionConsequences: [retitle],
});

// A second phase, "index", and an entity of the application's own kind holding state about the whole set.
export const indexed = declaration({
  phases: ["numbering", "index"],
  sectionConsequences: [collapse],
  figureConsequences: [renumber, autoCaption({}), dropBlank],
  captionConsequences: [retitle],
  withIndex: true,
});

// Two consequences of one phase that write one caption when a figure's title changes.
export const conflicting = declaration({
  phases: ["numbering"],
  figureConsequences: [renumber, autoCaption({})],
  captionConsequences: [retitle, shout],
});

// A consequence whose caption carries a member the caption's shape does not admit.
export const sloppy = declaration({
  phases: ["numbering"],
  figureConsequences: [renumber, autoCaption({ auto: true })],
  captionConsequences: [retitle],
});

// The base world with an intent resolver on figures.
export const resolving = declaration({
  phases: ["numbering"],
  figureConsequences: [renumber, autoCaption({})],
  captionConsequences: [retitle],
  resolver: placeFigure,
});

// A consequence placed in a phase the declaration does not declare.
export const undeclaredPhase = declaration({
  phases: ["numbering"],
  figureConsequences: [renumber, { ...autoCaption({}), phase: "captions" }],
  captionConsequences: [retitle],
});

// A consequence whose trigger names a kind the declaration does not declare.
export const undeclaredTriggerKind = declaration({
  phases: ["numbering"],
  figureConsequences: [renumber, { ...autoCaption({}), trigger: { created: ["table"] } }],
  captionConsequences: [retitle],
});

// Variant "citing", phase "numbering": a section whose heading changed to "See <id>" adds <id> to the figures it cites.
const citeByTitle = {
  name: "citeByTitle",
  trigger: { changed: { kind: "section", fields: ["heading"] } },
  phase: "numbering",
  run({ changes, view }) {
    const writes = [];
    for (const c of changesById(changes)) {
      const section = view.get("section", c.id);
      if (section === null) continue;
      const m = /^See (\S+)$/.exec(section.heading);
      if (m !== null && !section.cites.includes(m[1])) {
        writes.push({ op: "change", kind: "section", id: c.id, record: { ...section, cites: [...section.cites, m[1]] } });
      }
    }
    return writes;
  },
};

// Variant "withGallery", phase "numbering": a figure whose title was emptied leaves every gallery holding it.
const dropUntitled = {
  name: "dropUntitled",
  trigger: { changed: { kind: "figure", fields: ["title"] } },
  phase: "numbering",
  run({ changes, view }) {
    const emptied = new Set();
    for (const c of changes) {
      const figure = view.get("figure", c.id);
      if (figure !== null && figure.title === "") emptied.add(c.id);
    }
    const writes = [];
    for (const id of view.all("gallery").slice().sort(byId)) {
      const gallery = view.get("gallery", id);
      const kept = gallery.figures.filter((f) => !emptied.has(f));
      if (kept.length !== gallery.figures.length) {
        writes.push({ op: "change", kind: "gallery", id, record: { ...gallery, figures: kept } });
      }
    }
    return writes;
  },
};

// The base world with citeByTitle on sections; every other kind as in base.
export const citing = {
  ...base,
  kinds: base.kinds.map((k) => (k.kind === "section" ? { ...k, consequences: [citeByTitle] } : k)),
};

// The base world with a gallery kind holding at least two figures, a gallery left below two refusing the edit.
export const withGallery = {
  ...base,
  kinds: [
    ...base.kinds,
    {
      kind: "gallery",
      shape: {
        type: "object",
        properties: {
          name: { type: "string" },
          figures: { type: "array", items: { type: "string" } },
        },
        required: ["name", "figures"],
        additionalProperties: false,
      },
      references: [
        { field: "figures", targets: ["figure"], holds: "many", onTargetDelete: "unlink", min: 2, onBelowMin: "refuse" },
      ],
      consequences: [dropUntitled],
    },
  ],
};

// Variant "captionResolving": a caption created without a figure is attached to the figure "f<n>" with the highest n present.
function attachCaption({ item, view }) {
  if (item.op !== "create" || typeof item.record.figure === "string") return [item];
  let latest = null;
  let n = 0;
  for (const id of view.all("figure")) {
    const m = /^f(\d+)$/.exec(id);
    if (m !== null && Number(m[1]) > n) {
      n = Number(m[1]);
      latest = id;
    }
  }
  return [{ op: "create", kind: "caption", id: item.id, record: { ...item.record, figure: latest } }];
}

// The resolving world with attachCaption on captions; every other kind as in resolving.
export const captionResolving = {
  ...resolving,
  kinds: resolving.kinds.map((k) => (k.kind === "caption" ? { ...k, intentResolver: attachCaption } : k)),
};

// Contexts no JSON file can state, each a value plain JSON cannot hold.
export const contexts = {
  withFunction() {
    return { captionPrefix: "Fig.", format() { return "Fig."; } };
  },
  withCycle() {
    const context = { captionPrefix: "Fig." };
    context.again = context;
    return context;
  },
};
