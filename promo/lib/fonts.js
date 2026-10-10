// Shared by rendered pages: resolves once Inter is really loaded, so a missing font
// fails the render instead of silently falling back. `document.fonts.check()` is not
// enough: it also returns true when no Inter face was declared at all.
window.fontsReady = (async () => {
  await Promise.all(
    ['400', '600', '800', '900'].map((weight) => document.fonts.load(`${weight} 64px Inter`)),
  );
  await document.fonts.ready;
  const loaded = [...document.fonts].filter(
    (face) => face.family.replace(/["']/g, '') === 'Inter' && face.status === 'loaded',
  );
  if (!loaded.length) throw new Error('Inter did not load; check the network and Google Fonts');
})();
