import { describe, expect, test } from 'bun:test';
import { createLayerGalleryController } from './layer-gallery-controller.js';
import { icon } from './icons.js';

/** A hand-made element: what the controller touches, and the handlers it registered. */
function element(extra = {}) {
  const handlers = {};
  return {
    handlers,
    children: [],
    className: '',
    dataset: {},
    classList: { names: [], add(name) { this.names.push(name); } },
    textContent: '',
    innerHTML: '',
    disabled: false,
    attrs: {},
    open: false,
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(name, handler) { handlers[name] = handler; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    click() { handlers.click(); },
    ...extra,
  };
}

/** `code` has no thumbnail (a pictogram instead), `branding` is an identity layer: neither needs a canvas. */
function setup({ result = { ok: true }, pickImage } = {}) {
  const documentRef = { createElement: () => element() };
  const elements = { open: element(), dialog: element(), grid: element(), status: element(), close: element() };
  const added = [];
  const editor = { addLayer: (input) => { added.push(input); return result; } };
  const thumbnails = [];
  const createThumbnail = (input) => { const thumbnail = { input, el: element({ marker: 'thumb' }), destroyed: false, destroy() { this.destroyed = true; } }; thumbnails.push(thumbnail); return thumbnail; };
  const controller = createLayerGalleryController({
    elements,
    editor,
    labelOf: (kind) => `Libellé ${kind}`,
    addableKinds: ['code', 'branding', 'rain'],
    defaultOptions: (kind) => ({ defaults: kind }),
    ...(pickImage === undefined ? {} : { pickImage }),
    createThumbnail,
    documentRef,
  });
  const card = (kind) => elements.grid.children.find((node) => node.dataset.kind === kind);
  return { controller, elements, added, card, thumbnails };
}

describe('galerie d’ajout', () => {
  test('une carte par type, nommée, avec un pictogramme quand il n’y a pas de vignette', () => {
    const { elements, card } = setup();
    expect(elements.grid.children).toHaveLength(3);
    const [preview, label] = card('code').children;
    expect(label.textContent).toBe('Libellé code');
    expect(preview.classList.names).toContain('layer-thumb-identity');
    expect(preview.innerHTML).toContain('<svg');
    expect(preview.innerHTML).toBe(icon('code'));
    expect(card('branding').children[0].innerHTML).toBe(icon('type'));
    expect(card('code').type).toBe('button');
    expect(card('code').className).toBe('gallery-card');
  });

  test('le bouton « Ajouter » porte son pictogramme et son libellé ; il ouvre la galerie en effaçant l’ancien message', () => {
    const { elements } = setup();
    expect(elements.open.innerHTML).toContain('Ajouter');
    elements.status.textContent = 'ancien message';
    elements.open.click();
    expect(elements.dialog.open).toBe(true);
    expect(elements.status.textContent).toBe('');
  });

  test('sans showModal, la galerie s’ouvre par l’attribut open', () => {
    const { elements } = setup();
    elements.dialog.showModal = undefined;
    elements.open.click();
    expect(elements.dialog.attrs.open).toBe('');
  });

  test('fermer ferme la galerie', () => {
    const { elements } = setup();
    elements.dialog.open = true;
    elements.close.click();
    expect(elements.dialog.open).toBe(false);
  });

  test('un clic ajoute le type avec ses options de départ, efface le message et ferme', () => {
    const { elements, added, card } = setup();
    elements.dialog.open = true;
    elements.status.textContent = 'ancien';
    card('code').click();
    expect(added).toEqual([{ kind: 'code', options: { defaults: 'code' } }]);
    expect(elements.status.textContent).toBe('');
    expect(elements.dialog.open).toBe(false);
  });

  test('une couche d’identité s’ajoute sans options', () => {
    const { added, card } = setup();
    card('branding').click();
    expect(added).toEqual([{ kind: 'branding' }]);
  });

  test('un refus reste affiché dans la galerie, qui reste ouverte', () => {
    const { elements, card } = setup({ result: { ok: false, message: '8 couches au plus' } });
    elements.dialog.open = true;
    card('code').click();
    expect(elements.status.textContent).toBe('8 couches au plus');
    expect(elements.dialog.open).toBe(true);
  });

  test('l’image se choisit dans la médiathèque : la galerie se ferme sur elle et rien n’est ajouté', () => {
    let picked = 0;
    const documentRef = { createElement: () => element() };
    const elements = { open: element(), dialog: element(), grid: element(), status: element(), close: element() };
    const added = [];
    createLayerGalleryController({
      elements, editor: { addLayer: (input) => { added.push(input); return { ok: true }; } }, labelOf: String, addableKinds: ['image'], defaultOptions: () => ({}), pickImage: () => { picked += 1; }, createThumbnail: () => ({ el: element(), destroy() {} }), documentRef,
    });
    elements.dialog.open = true;
    elements.grid.children[0].click();
    expect(picked).toBe(1);
    expect(elements.dialog.open).toBe(false);
    expect(added).toEqual([]);
  });

  test('avec un sélecteur d’image, les autres types s’ajoutent normalement', () => {
    let picked = 0;
    const { added, card } = setup({ pickImage: () => { picked += 1; } });
    card('code').click();
    expect(picked).toBe(0);
    expect(added).toEqual([{ kind: 'code', options: { defaults: 'code' } }]);
  });

  test('sans sélecteur d’image, « image » s’ajoute comme les autres types', () => {
    const documentRef = { createElement: () => element() };
    const elements = { open: element(), dialog: element(), grid: element(), status: element(), close: element() };
    const added = [];
    createLayerGalleryController({
      elements, editor: { addLayer: (input) => { added.push(input); return { ok: true }; } }, labelOf: String, addableKinds: ['image'], defaultOptions: () => ({ a: 1 }), createThumbnail: () => ({ el: element(), destroy() {} }), documentRef,
    });
    elements.grid.children[0].click();
    expect(added).toEqual([{ kind: 'image', options: { a: 1 } }]);
  });

  test('sync désactive la carte d’une couche d’identité déjà présente, et la réactive quand elle part', () => {
    const { controller, card } = setup();
    controller.sync({ layers: [{ kind: 'branding' }] });
    expect(card('branding').disabled).toBe(true);
    expect(card('code').disabled).toBe(false);
    controller.sync({ layers: [{ kind: 'rain' }] });
    expect(card('branding').disabled).toBe(false);
    controller.sync({ layers: [{ kind: 'code' }, { kind: 'rain' }] });
    expect(card('code').disabled).toBe(false);
    expect(card('rain').disabled).toBe(false);
  });

  test('un type photographiable montre sa vignette : l’effet seul avec ses options de départ, à la largeur de la galerie ; elle est libérée à la destruction', () => {
    const { controller, card, thumbnails } = setup();
    expect(thumbnails).toHaveLength(1);
    const [thumbnail] = thumbnails;
    expect(thumbnail.input.width).toBe(160);
    expect(thumbnail.input.scene.layers[0]).toMatchObject({ kind: 'rain', options: { defaults: 'rain' }, visible: true, opacity: 1 });
    expect(card('rain').children[0].children).toContain(thumbnail.el);
    expect(card('rain').children[0].classList.names).not.toContain('layer-thumb-identity');
    controller.destroy();
    expect(thumbnail.destroyed).toBe(true);
  });
});
