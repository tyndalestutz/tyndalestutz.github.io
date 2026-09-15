# Photo viewer

Click a photo to enlarge it. Click the photo again, click outside it, use **Close ×**, or press **Escape** to return. Keyboard users can tab to a photo and press **Enter** or **Space**. Closing returns focus and keeps the page at the same scroll position.

## Preview the pull request locally

```sh
git fetch origin
git switch --track origin/feat/photo-lightbox
python3 -m http.server 8000 --bind 127.0.0.1
```

If the branch already exists locally, use `git switch feat/photo-lightbox` instead. Open <http://localhost:8000/projects.html> or <http://localhost:8000/misc.html>. Stop the server with **Ctrl+C**. Switch back with `git switch main`.

Serving the site over HTTP is necessary for its root-relative viewer asset URLs. No build, package installation, or service account is needed to preview or run the site. The live site changes only after the PR is merged and GitHub Pages deploys it.

## Implementation

- Two shared assets: `assets/photo-lightbox.js` and `assets/photo-lightbox.css`, loaded on all HTML pages.
- Native modal `<dialog>` with a dark backdrop, an uncropped image, and a visible Close button. No animation, gallery controls, framework, or runtime dependency.
- Existing images stay in their original positions in the DOM. The script adds keyboard semantics and listeners; it does not wrap images or change their size, margins, or layout rules.
- Photos and GIFs in the HTML are enabled automatically on page load. An image already inside a link or button keeps its existing action.
- The selected image uses the browser's `currentSrc`, preserves its aspect ratio, and fits within the viewport. It cannot reveal more detail than the source file contains.
- The background cannot scroll while the viewer is open. Scrollbar space is retained until closing.
- With JavaScript disabled or native dialogs unavailable, the page remains usable with its original images and links.

## Browser checks

Node.js 20+ and Python 3 are needed only for the development checks:

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
npm test
```

The tests cover Chromium, Firefox, WebKit, and an emulated iPhone. They compare all HTML pages against the local `main` branch at 1440, 390, and 320 CSS pixels. To compare with another Git revision:

```sh
PHOTO_BASE_REF=origin/main npm test
```

If WebKit reports an internal loading error from a Snap-installed editor on Linux, clear its inherited GTK overrides for the test run:

```sh
env -u GIO_MODULE_DIR -u GTK_PATH -u GTK_EXE_PREFIX -u GTK_IM_MODULE_FILE -u GTK_MODULES npm test
```

The layout comparison checks the geometry and styling of all original body elements and compares full-page screenshots pixel for pixel. Animated GIFs are hidden only during the screenshots; their geometry and viewer interactions are tested separately. Remote fonts, MathJax, and the experimental page's remote videos are blocked, and its scrolling animation is paused, to make comparisons repeatable.

Interaction checks open every available image and verify source selection, aspect ratio, viewport fit, all closing methods, focus return, scroll restoration, keyboard use, touch, resizing, existing image links, and the no-JavaScript fallback. `resume.html` already references a missing `assets/images/sample-image.png`; that broken asset is included in the layout comparison and skipped for enlargement.

To review the styling yourself, open the Projects page at desktop and phone widths, click both a photograph and a diagram, try each closing method, and confirm that you return to the same spot. Automated WebKit and device emulation do not replace a check on a physical iPhone.
