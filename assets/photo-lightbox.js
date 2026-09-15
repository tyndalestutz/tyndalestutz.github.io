(() => {
    'use strict';

    // Leave the page alone in browsers without native modal dialogs.
    if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;

    const dialog = document.createElement('dialog');
    dialog.className = 'photo-lightbox';
    dialog.setAttribute('aria-label', 'Enlarged photo');

    const photo = document.createElement('img');
    photo.className = 'photo-lightbox__image';
    photo.draggable = false;

    const close = document.createElement('button');
    close.className = 'photo-lightbox__close';
    close.type = 'button';
    close.textContent = 'Close ×';
    close.setAttribute('aria-label', 'Close enlarged photo');
    close.autofocus = true;

    dialog.append(photo, close);
    document.body.append(dialog);
    let opener;

    function open(image) {
        if (dialog.open || !image.complete || !image.naturalWidth) return;
        opener = image;
        photo.alt = image.alt;
        photo.src = image.currentSrc || image.src;
        // Retain the existing scrollbar space while the background is locked.
        document.documentElement.classList.toggle('photo-lightbox-gutter', window.innerWidth > document.documentElement.clientWidth);
        document.documentElement.classList.add('photo-lightbox-open');
        dialog.showModal();
    }

    // A second click anywhere in the viewer returns to the page.
    dialog.addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
        // Close is the only control; keep Tab and Shift+Tab within the viewer.
        if (event.key === 'Tab') {
            event.preventDefault();
            close.focus();
        }
    });
    dialog.addEventListener('close', () => {
        document.documentElement.classList.remove('photo-lightbox-open', 'photo-lightbox-gutter');
        opener?.focus({ preventScroll: true });
        photo.removeAttribute('src');
    });

    // No wrappers or image sizing changes: floats, flex items and spacing stay intact.
    // Existing image links and controls keep their original behavior.
    document.querySelectorAll('img').forEach(image => {
        if (image.closest('a, button, dialog, [role="button"]')) return;
        image.classList.add('photo-lightbox-trigger');
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute('aria-haspopup', 'dialog');
        image.setAttribute('aria-label', image.alt.trim() ? `Enlarge photo: ${image.alt}` : 'Enlarge photo');
        image.addEventListener('click', () => open(image));
        image.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open(image);
            }
        });
    });
})();
