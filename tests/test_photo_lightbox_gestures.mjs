import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = appSource.indexOf('function setPhotoLightboxTransform()');
const end = appSource.indexOf('\nfunction getEditPhotoEntries', start);
assert.ok(start >= 0 && end > start, 'photo lightbox gesture functions are present');
const gestureSource = appSource.slice(start, end);

function createGestureHarness() {
  const image = {
    clientWidth: 400,
    clientHeight: 600,
    naturalWidth: 400,
    naturalHeight: 600,
    style: {},
    classList: { toggle() {} },
  };
  const stage = {
    clientWidth: 400,
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
    setPointerCapture() {},
    hasPointerCapture: () => false,
    releasePointerCapture() {},
  };
  const build = new Function('image', 'stage', `
    let photoLightboxImage = image;
    let photoLightboxStage = stage;
    let photoLightboxUrls = ['photo-1', 'photo-2'];
    let photoLightboxIndex = 0;
    let photoLightboxScale = 1;
    let photoLightboxOffsetX = 0;
    let photoLightboxOffsetY = 0;
    let photoLightboxGesture = null;
    const photoLightboxPointers = new Map();
    const PHOTO_LIGHTBOX_MAX_SCALE = 4;
    const PHOTO_LIGHTBOX_SWIPE_THRESHOLD = 40;
    function updatePhotoLightbox() { resetPhotoLightboxZoom(); }
    function movePhotoLightbox(step) {
      if (photoLightboxUrls.length < 2) return;
      photoLightboxIndex = (photoLightboxIndex + step + photoLightboxUrls.length) % photoLightboxUrls.length;
      updatePhotoLightbox();
    }
    ${gestureSource}
    return {
      down: handlePhotoLightboxPointerDown,
      move: handlePhotoLightboxPointerMove,
      up: handlePhotoLightboxPointerUp,
      reset: resetPhotoLightboxZoom,
      state: () => ({ scale: photoLightboxScale, x: photoLightboxOffsetX, y: photoLightboxOffsetY, index: photoLightboxIndex }),
    };
  `);
  return { ...build(image, stage), image };
}

function pointer(pointerId, clientX, clientY) {
  return { pointerId, clientX, clientY, pointerType: 'touch', button: 0, target: { closest: () => null } };
}

test('pinch zooms and a one-finger drag pans without changing the photo', () => {
  const harness = createGestureHarness();
  harness.down(pointer(1, 150, 300));
  harness.down(pointer(2, 250, 300));
  harness.move(pointer(2, 350, 300));

  assert.equal(harness.state().scale, 2);
  assert.match(harness.image.style.transform, /scale\(2\)/);

  harness.up(pointer(2, 350, 300));
  harness.move(pointer(1, 170, 300));
  assert.equal(harness.state().scale, 2);
  assert.equal(harness.state().index, 0);
  assert.ok(harness.state().x > 0, 'the remaining finger pans the zoomed image');
  harness.up(pointer(1, 170, 300));
});

test('horizontal swipe still changes photos when the image is not zoomed', () => {
  const harness = createGestureHarness();
  harness.down(pointer(3, 300, 300));
  harness.up(pointer(3, 230, 300));

  assert.equal(harness.state().index, 1);
});
