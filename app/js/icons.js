'use strict';
(function (P) {
  const s16 = b => '<svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">' + b + '</svg>'
  const s32 = b => '<svg viewBox="0 0 32 32" width="32" height="32" xmlns="http://www.w3.org/2000/svg">' + b + '</svg>'

  const doc32 = (extra, band) => s32(
    '<path d="M6.5 2.5h13l6 6v21h-19z" fill="#fff" stroke="#7b8796"/><path d="M19.5 2.5v6h6" fill="#e9edf2" stroke="#7b8796"/>' +
    (band ? '<rect x="4" y="17" width="20" height="8" fill="' + band[0] + '"/><text x="14" y="23.6" font-family="Segoe UI,Arial" font-size="6.6" font-weight="700" fill="#fff" text-anchor="middle">' + band[1] + '</text>' : '') +
    (extra || ''))

  const floppy = (sz) => {
    const k = sz / 16
    return '<g transform="scale(' + k + ')"><path d="M1.5 1.5h11l2 2v11h-13z" fill="#3d73c4" stroke="#24508f" stroke-width=".8"/><rect x="4" y="1.5" width="7" height="4.5" fill="#fff"/><rect x="8.5" y="2.3" width="1.6" height="2.8" fill="#24508f"/><rect x="3.5" y="9" width="9" height="5.5" fill="#e8eef6"/><path d="M5 11h6M5 12.8h6" stroke="#9db3d2" stroke-width=".7"/></g>'
  }

  const magn32 = inner => s32('<circle cx="13" cy="13" r="9" fill="#e4f2ff" stroke="#3b6ea5" stroke-width="2.4"/><path d="M19.5 19.5 L28.5 28.5" stroke="#6b4e2e" stroke-width="4.5" stroke-linecap="round"/>' + inner)

  const people = (x, y, k) => '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' +
    '<circle cx="11" cy="7" r="4" fill="#5b9bd5" stroke="#2e6aa8"/><path d="M3.5 21c0-5 3.4-8 7.5-8s7.5 3 7.5 8z" fill="#5b9bd5" stroke="#2e6aa8"/>' +
    '<circle cx="5.5" cy="9" r="3" fill="#9cc3e8" stroke="#4f86bd"/><path d="M0.5 20c0-3.6 2.2-6.3 5-6.3 1.4 0 2.6.6 3.5 1.6-1.7 1.3-2.8 3-3 4.7z" fill="#9cc3e8" stroke="#4f86bd"/></g>'

  const I = P.icons = {
    app: s16('<path d="M8 1.5C4 1.5 1 4.3 1 7.8c0 3.6 3 6.4 6.6 6.4 1.1 0 1.6-.6 1.6-1.3 0-.9-.8-1.1-.8-2 0-.8.6-1.3 1.4-1.3h1.8c2 0 3.4-1.3 3.4-3.2C15 3.6 11.9 1.5 8 1.5z" fill="#f6d78c" stroke="#a37b2c" stroke-width=".8"/><circle cx="4.4" cy="7.4" r="1.3" fill="#e81123"/><circle cx="6.4" cy="4.4" r="1.3" fill="#107c10"/><circle cx="10" cy="4.2" r="1.3" fill="#0078d7"/><circle cx="12.2" cy="6.6" r="1.2" fill="#ffb900"/>'),
    save: s16(floppy(16)),
    undo: s16('<path d="M5 3.5 1.5 7 5 10.5" fill="none" stroke="#2f6fbf" stroke-width="1.8" stroke-linejoin="round"/><path d="M2.2 7H10a4 4 0 0 1 0 8H7" fill="none" stroke="#2f6fbf" stroke-width="1.8"/>'),
    redo: s16('<path d="M11 3.5 14.5 7 11 10.5" fill="none" stroke="#2f6fbf" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.8 7H6a4 4 0 0 0 0 8h3" fill="none" stroke="#2f6fbf" stroke-width="1.8"/>'),
    qatMore: '<svg viewBox="0 0 10 16" width="10" height="16"><path d="M2 6.5h6M2.5 9l2.5 2.6L7.5 9z" stroke="#444" fill="#444"/></svg>',
    help: s16('<circle cx="8" cy="8" r="6.8" fill="#1e73d2"/><path d="M5.9 6.1c0-1.3 1-2.1 2.2-2.1 1.3 0 2.2.8 2.2 1.9 0 1.6-2.1 1.7-2.1 3.3" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><circle cx="8.2" cy="11.6" r=".95" fill="#fff"/>'),
    collapse: s16('<path d="M4 10l4-4 4 4" fill="none" stroke="#444" stroke-width="1.3"/>'),
    expand: s16('<path d="M4 6l4 4 4-4" fill="none" stroke="#444" stroke-width="1.3"/>'),

    paste32: s32('<rect x="4.5" y="4.5" width="19" height="25" rx="2" fill="#d2a463" stroke="#8a6a3a"/><rect x="10.5" y="2.5" width="7" height="5" rx="1" fill="#b4bfcc" stroke="#6c7884"/><path d="M12.5 10.5h12l4 4v15h-16z" fill="#fff" stroke="#7d8a99"/><path d="M24.5 10.5v4h4" fill="#e6eaef" stroke="#7d8a99"/><path d="M15.5 17h10M15.5 20h10M15.5 23h10M15.5 26h7" stroke="#a9bbd0"/>'),
    paste: s16('<rect x="1.5" y="2.5" width="10" height="12.5" rx="1" fill="#d2a463" stroke="#8a6a3a"/><rect x="4.5" y="1.5" width="4" height="2.5" fill="#b4bfcc" stroke="#6c7884" stroke-width=".7"/><path d="M6.5 5.5h6l2 2v7.5h-8z" fill="#fff" stroke="#7d8a99"/><path d="M8 9h5M8 11h5M8 13h4" stroke="#a9bbd0" stroke-width=".8"/>'),
    pasteFrom: s16('<path d="M1 4.5h4l1 1h6.5v8H1z" fill="#f4cd5a" stroke="#b08a1f"/><rect x="7.5" y="1.5" width="7" height="9" rx="1" fill="#d2a463" stroke="#8a6a3a"/><path d="M9 4h4M9 6h4M9 8h3" stroke="#fff"/>'),
    cut: s16('<path d="M5.2 1.2 9.8 9.6M10.8 1.2 6.2 9.6" stroke="#5a6b7d" stroke-width="1.4" fill="none"/><circle cx="5" cy="12" r="2.3" fill="#fff" stroke="#2b6cc4" stroke-width="1.5"/><circle cx="11" cy="12" r="2.3" fill="#fff" stroke="#2b6cc4" stroke-width="1.5"/>'),
    copy: s16('<path d="M1.5 1.5h6l2 2v7.5h-8z" fill="#fff" stroke="#6d7a8a"/><path d="M6.5 5.5h6l2 2v7.5h-8z" fill="#fff" stroke="#6d7a8a"/><path d="M8.5 9h4M8.5 11h4M8.5 13h3" stroke="#9fb2c8" stroke-width=".8"/>'),

    select32: s32('<rect x="3.5" y="5.5" width="25" height="20" fill="#e3eefb" stroke="#fff"/><rect x="3.5" y="5.5" width="25" height="20" fill="none" stroke="#222" stroke-dasharray="2 2"/>'),
    crop: s16('<path d="M4 1v11h11" fill="none" stroke="#2b6cc4" stroke-width="1.8"/><path d="M1 4h11v11" fill="none" stroke="#555" stroke-width="1.8"/>'),
    resize: s16('<rect x="1.5" y="6.5" width="7" height="7" fill="#cfe2f8" stroke="#3a70b8"/><rect x="1.5" y="1.5" width="13" height="12" fill="none" stroke="#555" stroke-dasharray="1.5 1.5"/><path d="M8 7l5-4.5M10 2.5h3v3" fill="none" stroke="#2b8a3e" stroke-width="1.3"/>'),
    rotate: s16('<rect x="4.5" y="5.5" width="8" height="9" fill="#fff" stroke="#6d7a8a"/><path d="M2 8A6 6 0 0 1 10 2.3" fill="none" stroke="#2b8a3e" stroke-width="1.5"/><path d="M8.6 0.6 11 2.4 8.7 4.4" fill="none" stroke="#2b8a3e" stroke-width="1.3"/>'),
    rotR: s16('<rect x="4.5" y="5.5" width="8" height="9" fill="#fff" stroke="#6d7a8a"/><path d="M2 8A6 6 0 0 1 10 2.3" fill="none" stroke="#2b8a3e" stroke-width="1.5"/><path d="M8.6 0.6 11 2.4 8.7 4.4" fill="none" stroke="#2b8a3e" stroke-width="1.3"/><text x="8.5" y="12.6" font-size="6" text-anchor="middle" font-family="Segoe UI" fill="#333">90</text>'),
    rotL: s16('<rect x="3.5" y="5.5" width="8" height="9" fill="#fff" stroke="#6d7a8a"/><path d="M14 8A6 6 0 0 0 6 2.3" fill="none" stroke="#2b8a3e" stroke-width="1.5"/><path d="M7.4 0.6 5 2.4 7.3 4.4" fill="none" stroke="#2b8a3e" stroke-width="1.3"/><text x="7.5" y="12.6" font-size="6" text-anchor="middle" font-family="Segoe UI" fill="#333">90</text>'),
    rot180: s16('<rect x="4.5" y="5.5" width="8" height="9" fill="#fff" stroke="#6d7a8a"/><path d="M3 12A6 6 0 1 1 13 4" fill="none" stroke="#2b8a3e" stroke-width="1.5"/><text x="8.5" y="12.6" font-size="5.5" text-anchor="middle" font-family="Segoe UI" fill="#333">180</text>'),
    flipV: s16('<path d="M2 7h12" stroke="#2b6cc4" stroke-dasharray="1.5 1"/><path d="M3 5.5 8 1l5 4.5z" fill="#7aa7e0" stroke="#3a70b8"/><path d="M3 8.5 8 13l5-4.5z" fill="none" stroke="#3a70b8"/>'),
    flipH: s16('<path d="M8 2v12" stroke="#2b6cc4" stroke-dasharray="1.5 1"/><path d="M6.5 3 2 8l4.5 5z" fill="#7aa7e0" stroke="#3a70b8"/><path d="M9.5 3 14 8l-4.5 5z" fill="none" stroke="#3a70b8"/>'),
    selRect: s16('<rect x="1.5" y="3.5" width="13" height="9" fill="none" stroke="#222" stroke-dasharray="1.5 1.5"/>'),
    selFree: s16('<path d="M3 4c3-3 9-2 11 1s-2 8-6 7-7 1-6-3 0-3 1-5z" fill="none" stroke="#222" stroke-dasharray="1.5 1.5"/>'),
    selAll: s16('<rect x="1.5" y="1.5" width="13" height="13" fill="#d4e5f9" stroke="#222" stroke-dasharray="1.5 1.5"/>'),
    selInv: s16('<rect x="1.5" y="1.5" width="13" height="13" fill="#d4e5f9" stroke="#222" stroke-dasharray="1.5 1.5"/><rect x="5" y="5" width="6" height="6" fill="#fff" stroke="#555"/>'),
    selDel: s16('<rect x="1.5" y="3.5" width="13" height="9" fill="none" stroke="#222" stroke-dasharray="1.5 1.5"/><path d="M5 5l6 6M11 5l-6 6" stroke="#d13438" stroke-width="1.8"/>'),
    selTrans: s16('<rect x="1.5" y="2.5" width="13" height="11" fill="#fff" stroke="#555"/><path d="M1.5 2.5h3v3h-3zM7.5 2.5h3v3h-3zM4.5 5.5h3v3h-3zM10.5 5.5h4v3h-4zM1.5 8.5h3v3h-3zM7.5 8.5h3v3h-3zM4.5 11.5h3v2h-3zM10.5 11.5h4v2h-4z" fill="#c8c8c8"/>'),

    pencil: s16('<path d="M2.2 11.5 11 2.7 13.3 5 4.5 13.8z" fill="#f6c343" stroke="#9c7a22" stroke-width=".8"/><path d="M1 15l1.2-3.5 2.3 2.3z" fill="#f2d9a8" stroke="#9c7a22" stroke-width=".8"/><path d="M1 15l.6-1.8 1.2 1.2z" fill="#333"/><path d="M11 2.7l1.6-1.6 2.3 2.3L13.3 5z" fill="#ef8f9c" stroke="#a8505d" stroke-width=".8"/>'),
    bucket: s16('<path d="M3.5 6.5 8 2l5.5 5.5L9 12z" fill="#eef1f5" stroke="#5f6b78" stroke-width=".9"/><path d="M3.5 6.5 9 12" stroke="#5f6b78" stroke-width=".9"/><path d="M3.4 6.3c-1.7 1.8-1.6 4.4-1.3 6.2.3 1.6 1.9 1.6 2 .1.1-1.6-.8-3.3-.7-6.3z" fill="#2f7fe0"/><path d="M6.2 3.8C7.4 1.2 10.8.9 11.4 3.6" fill="none" stroke="#5f6b78" stroke-width=".9"/>'),
    text: s16('<text x="8" y="13.6" font-family="Times New Roman,serif" font-size="15.5" font-weight="700" text-anchor="middle" fill="#222">A</text>'),
    eraser: s16('<path d="M1.6 10.4 6.8 5.2l4 4L5.6 14.4z" fill="#fff" stroke="#6b6b6b" stroke-width=".9"/><path d="M6.8 5.2l3.4-3.4 4 4-3.4 3.4z" fill="#f08aa0" stroke="#a24a5c" stroke-width=".9"/><path d="M5.6 14.5H14" stroke="#9aa3ad" stroke-width=".9"/>'),
    picker: s16('<path d="M10.4 1.6a2.2 2.2 0 0 1 3.9 3l-1.9 2-3-3z" fill="#4a5560"/><path d="M8.3 3.7l4 4-1.3 1.3-4-4z" fill="#4a5560"/><path d="M8.5 6.2 2.9 11.8l-1.4 2.7 2.7-1.4 5.6-5.6z" fill="#cfe6fb" stroke="#4d6b86" stroke-width=".9"/>'),
    magnifier: s16('<circle cx="6.3" cy="6.3" r="4.6" fill="#e4f2ff" stroke="#3b6ea5" stroke-width="1.5"/><path d="M9.8 9.8l4.6 4.6" stroke="#6b4e2e" stroke-width="2.5" stroke-linecap="round"/>'),
    brush32: s32('<path d="M26 2l4 4-11.5 11.5-4-4z" fill="#c8874a" stroke="#7a4f24"/><path d="M14.5 13.5l4 4-2 2-4-4z" fill="#c9d0d8" stroke="#68727d"/><path d="M12.5 15.5l4 4C15 24 10 27.5 3 29c1.5-7 5-11.5 9.5-13.5z" fill="#2f6fd6" stroke="#1d4a96"/>'),
    outline: s16('<rect x="1.5" y="3.5" width="9" height="9" fill="none" stroke="#222" stroke-width="1.2"/><path d="M8 13 14 7l1.5 1.5-6 6L7.4 15z" fill="#f6c343" stroke="#9c7a22" stroke-width=".7"/>'),
    fillstyle: s16('<rect x="1.5" y="6.5" width="9" height="8" fill="#2f7fe0" stroke="#1d4a96"/><path d="M7 4.5 10 1.5l4 4-3 3z" fill="#eef1f5" stroke="#5f6b78" stroke-width=".8"/>'),
    size32: s32('<rect x="4" y="5" width="24" height="1" fill="#111"/><rect x="4" y="10" width="24" height="2" fill="#111"/><rect x="4" y="16" width="24" height="3" fill="#111"/><rect x="4" y="23" width="24" height="5" fill="#111"/>'),
    editcolors32: (function () {
      let b = ''
      const cols = ['#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080']
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * Math.PI * 2 - Math.PI / 2; const a1 = ((i + 1) / 12) * Math.PI * 2 - Math.PI / 2
        const p = (a, r) => (16 + Math.cos(a) * r).toFixed(2) + ' ' + (15 + Math.sin(a) * r).toFixed(2)
        b += '<path d="M16 15L' + p(a0, 12) + 'A12 12 0 0 1 ' + p(a1, 12) + 'Z" fill="' + cols[i] + '"/>'
      }
      return s32('<defs><radialGradient id="ecw"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' + b + '<circle cx="16" cy="15" r="12" fill="url(#ecw)"/><circle cx="16" cy="15" r="12" fill="none" stroke="#666" stroke-width=".8"/><path d="M27 21l3 3-6 6h-3v-3z" fill="#f6c343" stroke="#9c7a22" stroke-width=".8"/>')
    })(),

    zoomIn32: magn32('<path d="M8.5 13h9M13 8.5v9" stroke="#2b6cc4" stroke-width="2.4"/>'),
    zoomOut32: magn32('<path d="M8.5 13h9" stroke="#2b6cc4" stroke-width="2.4"/>'),
    zoom100_32: magn32('<text x="13" y="16" font-size="8" font-weight="700" font-family="Segoe UI,Arial" text-anchor="middle" fill="#2b6cc4">100</text>'),
    fullscreen32: s32('<rect x="2.5" y="4.5" width="27" height="18" rx="1" fill="#2b2b2b"/><rect x="4.5" y="6.5" width="23" height="14" fill="#3f8ae0"/><path d="M12 22.5h8l1.5 4h-11z" fill="#9aa3ad"/><path d="M9 27.5h14" stroke="#666" stroke-width="1.5"/><path d="M7 9h4M7 9v3M25 18h-4M25 18v-3" stroke="#fff" stroke-width="1.4"/>'),
    thumb32: s32('<rect x="2.5" y="3.5" width="27" height="24" fill="#fff" stroke="#6d7a8a"/><rect x="2.5" y="3.5" width="27" height="4" fill="#3f8ae0"/><rect x="12.5" y="13.5" width="13" height="10" fill="#cfe9c9" stroke="#2b8a3e"/><circle cx="16" cy="17" r="1.6" fill="#ffb900"/><path d="M13 23l4-4 3 2 5-4v6z" fill="#2b8a3e"/>'),

    fileNew: doc32(''),
    fileOpen: s32('<path d="M2.5 7.5h9l2 2h13v17h-24z" fill="#e5b73b" stroke="#a6801a"/><path d="M5.5 12.5h24l-3 14h-24z" fill="#f6d27a" stroke="#a6801a"/>'),
    fileSave: s32(floppy(32)),
    fileSaveAs: s32(floppy(28) + '<path d="M17 30l1-4 10-10 3 3-10 10z" fill="#f6c343" stroke="#9c7a22"/>'),
    filePrint: s32('<rect x="7.5" y="3.5" width="17" height="10" fill="#fff" stroke="#7b8796"/><rect x="2.5" y="12.5" width="27" height="11" rx="2" fill="#9aa3ad" stroke="#5f6b78"/><rect x="7.5" y="19.5" width="17" height="9" fill="#fff" stroke="#7b8796"/><circle cx="25" cy="16" r="1.2" fill="#3fbf55"/>'),
    fileScan: s32('<rect x="2.5" y="14.5" width="27" height="10" rx="2" fill="#9aa3ad" stroke="#5f6b78"/><path d="M4 14.5l3-7h18l3 7" fill="#cdd4dc" stroke="#5f6b78"/><path d="M5 19.5h22" stroke="#3f8ae0" stroke-width="2"/>'),
    fileMail: s32('<rect x="2.5" y="7.5" width="27" height="18" fill="#fff" stroke="#7b8796"/><path d="M2.5 7.5 16 18 29.5 7.5" fill="none" stroke="#7b8796"/>'),
    fileDesktop: s32('<rect x="2.5" y="4.5" width="27" height="18" rx="1" fill="#2b2b2b"/><rect x="4.5" y="6.5" width="23" height="14" fill="#7fc0f5"/><path d="M5 20l7-7 5 5 4-3 6 5z" fill="#2b8a3e"/><path d="M12 22.5h8l1.5 4h-11z" fill="#9aa3ad"/>'),
    fileProps: doc32('<path d="M10 14h10M10 18h10M10 22h6" stroke="#9fb2c8" stroke-width="1.4"/><circle cx="23" cy="24" r="5.5" fill="#3d73c4"/><path d="M20.5 24l2 2 3.5-4" fill="none" stroke="#fff" stroke-width="1.6"/>'),
    fileAbout: s32('<circle cx="16" cy="16" r="13" fill="#1e73d2"/><circle cx="16" cy="9.5" r="2" fill="#fff"/><path d="M16 14v10" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>'),
    fileExit: s32('<rect x="4.5" y="3.5" width="15" height="25" fill="#c8874a" stroke="#7a4f24"/><circle cx="16" cy="16.5" r="1.2" fill="#ffd34d"/><path d="M19 16h11M26 12l4 4-4 4" fill="none" stroke="#d13438" stroke-width="2.2"/>'),
    fmtPNG: doc32('', ['#2b8a3e', 'PNG']),
    fmtJPG: doc32('', ['#d36b00', 'JPEG']),
    fmtBMP: doc32('', ['#3d73c4', 'BMP']),
    fmtGIF: doc32('', ['#8764b8', 'GIF']),
    fmtOther: doc32('<path d="M10 14h10M10 18h10M10 22h10" stroke="#9fb2c8" stroke-width="1.4"/>'),

    mpCreate32: s32(people(1, 5, 1.05) + '<circle cx="25" cy="23" r="6" fill="#2b8a3e"/><path d="M25 19.5v7M21.5 23h7" stroke="#fff" stroke-width="2"/>'),
    mpInvite32: s32('<rect x="2.5" y="9.5" width="20" height="14" fill="#fff" stroke="#7b8796"/><path d="M2.5 9.5 12.5 17l10-7.5" fill="none" stroke="#7b8796"/>' + people(16, 8, 0.7)),
    mpBrowse32: s32('<rect x="2.5" y="3.5" width="21" height="24" fill="#fff" stroke="#7b8796"/><path d="M6 9h14M6 13h14M6 17h10M6 21h8" stroke="#3d73c4" stroke-width="1.6"/><circle cx="22" cy="21" r="5" fill="#e4f2ff" stroke="#3b6ea5" stroke-width="1.8"/><path d="M25.5 24.5l4 4" stroke="#6b4e2e" stroke-width="2.6" stroke-linecap="round"/>'),
    mpLog32: doc32('<path d="M9 17h3l2-5 3 10 2.5-7 1.5 2h3" fill="none" stroke="#d13438" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 25h10" stroke="#9fb2c8" stroke-width="1.4"/>'),
    mpKey: s16('<circle cx="5" cy="8" r="3.4" fill="#ffd34d" stroke="#a6801a"/><circle cx="4.4" cy="8" r="1" fill="#fff"/><path d="M8.3 8H15M13 8v2.6M11 8v2" stroke="#a6801a" stroke-width="1.6"/>'),
    mpCopy: s16('<path d="M1.5 1.5h6l2 2v7.5h-8z" fill="#fff" stroke="#6d7a8a"/><path d="M6.5 5.5h6l2 2v7.5h-8z" fill="#fff" stroke="#6d7a8a"/><text x="10.5" y="13.4" font-size="5.5" text-anchor="middle" font-family="Segoe UI" font-weight="700" fill="#3d73c4">ID</text>'),
    mpLeave: s16('<rect x="1.5" y="1.5" width="8" height="13" fill="#c8874a" stroke="#7a4f24"/><path d="M9 8h6.5M12.5 5l3 3-3 3" fill="none" stroke="#d13438" stroke-width="1.6"/>'),
    mpFriends: s16(people(0, 0, 0.72)),

    sbPos: s16('<path d="M8 1v4M8 11v4M1 8h4M11 8h4" stroke="#444"/><path d="M8 8l2.5 6.5 1-2.5 2.5-1z" fill="#fff" stroke="#222" stroke-width=".8"/>'),
    sbSel: s16('<rect x="1.5" y="2.5" width="11" height="9" fill="none" stroke="#333" stroke-dasharray="1.5 1.5"/><path d="M10 10l5 5M15 11.5V15h-3.5" fill="none" stroke="#333"/>'),
    sbSize: s16('<rect x="1.5" y="2.5" width="11" height="10" fill="#fff" stroke="#555"/><rect x="11" y="11" width="4" height="4" fill="#555"/>'),
    sbFile: s16(floppy(15)),
    sbNet: s16(people(0, 0, 0.72)),

    // letters follow the UI language (Ж К Ч in Russian Paint, B I U in English)
    get bold () { return '<span class="txt-ic" style="font-weight:700">' + (P.i18n.lang() === 'en' ? 'B' : 'Ж') + '</span>' },
    get italic () { return '<span class="txt-ic" style="font-style:italic;font-family:Times New Roman,serif">' + (P.i18n.lang() === 'en' ? 'I' : 'К') + '</span>' },
    get underline () { return '<span class="txt-ic" style="text-decoration:underline">' + (P.i18n.lang() === 'en' ? 'U' : 'Ч') + '</span>' },
    langRu: s16('<rect x="0.5" y="2.5" width="15" height="11" rx="1.5" fill="#fff" stroke="#7b8796"/><text x="8" y="11" font-size="7" font-weight="700" font-family="Segoe UI,Arial" text-anchor="middle" fill="#333">RU</text>'),
    langEn: s16('<rect x="0.5" y="2.5" width="15" height="11" rx="1.5" fill="#fff" stroke="#7b8796"/><text x="8" y="11" font-size="7" font-weight="700" font-family="Segoe UI,Arial" text-anchor="middle" fill="#333">EN</text>'),
    strike: '<span class="txt-ic" style="text-decoration:line-through;font-size:11px">abc</span>',
    opaque: s16('<rect x="1.5" y="1.5" width="13" height="13" fill="#fff59d" stroke="#888"/><text x="8" y="12.5" font-family="Times New Roman,serif" font-size="12" font-weight="700" text-anchor="middle" fill="#222">A</text>'),
    transparent: s16('<rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="#888"/><path d="M2 2h3v3H2zM8 2h3v3H8zM5 5h3v3H5zM11 5h3v3h-3zM2 8h3v3H2zM8 8h3v3H8zM5 11h3v3H5zM11 11h3v3h-3z" fill="#d6d6d6"/><text x="8" y="12.5" font-family="Times New Roman,serif" font-size="12" font-weight="700" text-anchor="middle" fill="#222">A</text>'),
    check: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#222" stroke-width="1.5"/></svg>',
    arrowDown: '<svg viewBox="0 0 7 4" width="7" height="4"><path d="M0 0h7L3.5 4z" fill="#444"/></svg>',
    arrowRight: '<svg viewBox="0 0 4 7" width="4" height="7"><path d="M0 0v7l4-3.5z" fill="#444"/></svg>',
    galUp: '<svg viewBox="0 0 7 4" width="7" height="4"><path d="M0 4h7L3.5 0z" fill="#555"/></svg>',
    galDown: '<svg viewBox="0 0 7 4" width="7" height="4"><path d="M0 0h7L3.5 4z" fill="#555"/></svg>',
    galMore: '<svg viewBox="0 0 7 7" width="7" height="7"><path d="M0 1h7M0 3h7L3.5 7z" stroke="#555" fill="#555" stroke-width=".8"/></svg>',
    warn: '<svg viewBox="0 0 32 32" width="32" height="32"><path d="M16 2 31 29H1z" fill="#ffc83d" stroke="#c49000"/><path d="M16 11v9" stroke="#222" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="24.5" r="1.6" fill="#222"/></svg>',
    question: '<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#1e73d2"/><path d="M11.5 12.3c0-2.6 2-4.3 4.6-4.3 2.7 0 4.6 1.7 4.6 4 0 3.3-4.3 3.5-4.3 6.8" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/><circle cx="16.4" cy="23.6" r="1.8" fill="#fff"/></svg>',
    info: '<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#1e73d2"/><circle cx="16" cy="9.5" r="2" fill="#fff"/><path d="M16 14v10" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>',
    error: '<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#e81123"/><path d="M10.5 10.5l11 11M21.5 10.5l-11 11" stroke="#fff" stroke-width="2.8"/></svg>'
  }

  I.cursorArrow = color => '<svg viewBox="0 0 16 22" width="16" height="22" xmlns="http://www.w3.org/2000/svg"><path d="M1 1v17l4.4-4.2 3 6.8 2.7-1.2-3-6.6H14z" fill="' + color + '" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>'

  // CSS cursors (hotspot coordinates are in the 32px image)
  const cur = (svg, x, y, fb) => 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '") ' + x + ' ' + y + ', ' + (fb || 'crosshair')
  P.cursors = {
    pencil: cur('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M2.2 11.5 11 2.7 13.3 5 4.5 13.8z" fill="#fff" stroke="#000" stroke-width=".9"/><path d="M1 15l1.2-3.5 2.3 2.3z" fill="#fff" stroke="#000" stroke-width=".9"/><path d="M1 15l.6-1.8 1.2 1.2z" fill="#000"/></svg>', 1, 15),
    fill: cur('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(1 1)"><path d="M3.5 6.5 8 2l5.5 5.5L9 12z" fill="#fff" stroke="#000" stroke-width=".9"/><path d="M3.4 6.3c-1.7 1.8-1.6 4.4-1.3 6.2.3 1.6 1.9 1.6 2 .1.1-1.6-.8-3.3-.7-6.3z" fill="#000"/><path d="M6.2 3.8C7.4 1.2 10.8.9 11.4 3.6" fill="none" stroke="#000" stroke-width=".9"/></g></svg>', 3, 15),
    picker: cur('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M10.4 1.6a2.2 2.2 0 0 1 3.9 3l-1.9 2-3-3z" fill="#000"/><path d="M8.3 3.7l4 4-1.3 1.3-4-4z" fill="#000"/><path d="M8.5 6.2 2.9 11.8l-1.4 2.7 2.7-1.4 5.6-5.6z" fill="#fff" stroke="#000" stroke-width=".9"/></svg>', 1, 14),
    zoom: cur('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="6.3" cy="6.3" r="4.6" fill="#fff" stroke="#000" stroke-width="1.3"/><path d="M9.8 9.8l4.6 4.6" stroke="#000" stroke-width="2.2" stroke-linecap="round"/></svg>', 6, 6),
    brush: cur('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M8 0v6M8 10v6M0 8h6M10 8h6" stroke="#000"/><path d="M8 0v6M8 10v6M0 8h6M10 8h6" stroke="#fff" stroke-width=".5" opacity=".6"/></svg>', 8, 8)
  }
})(window.P)
