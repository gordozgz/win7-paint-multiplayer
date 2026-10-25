'use strict';
(function (P) {
  const U = P.util
  const $ = U.$
  const h = U.h

  const Dl = P.dialogs = {}
  let openCount = 0
  Dl.isOpen = () => openCount > 0

  Dl.open = function (opts) {
    const layer = $('#layer-dialogs')
    const shield = h('div.modal-shield')
    const body = h('div.dlg-body', null, opts.body)
    const btns = h('div.dlg-buttons')
    const dlg = h('div.dlg', { style: { width: opts.width ? opts.width + 'px' : null } },
      h('div.dlg-title', null, h('span.t', { text: opts.title }), h('button.dlg-close', { title: 'Закрыть', html: '&#x2715;' })),
      body, btns)
    let closed = false
    const close = (v) => {
      if (closed) return
      closed = true
      openCount--
      shield.remove(); dlg.remove()
      document.removeEventListener('keydown', onKey, true)
      if (opts.onClose) opts.onClose(v)
    }
    const buttons = (opts.buttons || []).map((b, i) => {
      const el = h('button.btn' + (b.default ? '.default' : ''), { text: b.label })
      el.addEventListener('click', () => {
        if (b.action && b.action() === false) return
        close(b.value !== undefined ? b.value : i)
      })
      btns.appendChild(el)
      b.el = el
      return b
    })
    if (!buttons.length) btns.remove()
    dlg.querySelector('.dlg-close').addEventListener('click', () => {
      const c = buttons.find(b => b.cancel)
      if (c && c.action) c.action()
      close(c ? (c.value !== undefined ? c.value : buttons.indexOf(c)) : -1)
    })
    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        dlg.querySelector('.dlg-close').click()
      } else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'TEXTAREA') {
        const d = buttons.find(b => b.default)
        if (d) { e.preventDefault(); e.stopPropagation(); d.el.click() }
      }
      e.stopPropagation()
    }
    document.addEventListener('keydown', onKey, true)
    // drag by title
    const title = dlg.querySelector('.dlg-title')
    title.addEventListener('pointerdown', e => {
      if (e.target.closest('.dlg-close')) return
      title.setPointerCapture(e.pointerId)
      const r = dlg.getBoundingClientRect(); const ox = e.clientX - r.left; const oy = e.clientY - r.top
      const mv = ev => { dlg.style.left = (ev.clientX - ox) + 'px'; dlg.style.top = Math.max(0, ev.clientY - oy) + 'px' }
      const up = () => { title.removeEventListener('pointermove', mv); title.removeEventListener('pointerup', up) }
      title.addEventListener('pointermove', mv); title.addEventListener('pointerup', up)
    })
    shield.addEventListener('pointerdown', e => { e.preventDefault(); dlg.animate([{ borderColor: '#aaa' }, { borderColor: '#1883d7' }], { duration: 150, iterations: 3 }) })
    layer.appendChild(shield)
    layer.appendChild(dlg)
    openCount++
    P.ui.closeMenus()
    const r = dlg.getBoundingClientRect()
    dlg.style.left = Math.max(0, (window.innerWidth - r.width) / 2) + 'px'
    dlg.style.top = Math.max(0, (window.innerHeight - r.height) / 2.4) + 'px'
    const f = dlg.querySelector('[autofocus]') || dlg.querySelector('input:not([type=radio]):not([type=checkbox])') || (buttons.find(b => b.default) || {}).el
    if (f) setTimeout(() => { f.focus(); if (f.select) f.select() }, 0)
    return { el: dlg, close }
  }

  // Message boxes are standard Windows ones in Paint.exe.
  // opts: title, icon (info|warn|error|question), main (instruction), text,
  // buttons, default, cancel. Resolves with the button index (-1: closed).
  const BOX_TYPE = { info: 'info', warn: 'warning', error: 'error', question: 'question' }
  Dl.message = function (opts) {
    const labels = opts.buttons || ['ОК']
    const def = opts.default || 0
    const cancel = opts.cancel != null ? opts.cancel : labels.length - 1
    const native = window.native
    if (native && native.messageBox) {
      openCount++
      P.ui.closeMenus()
      const main = opts.main ? P.T(opts.main) : P.T(opts.text || '')
      return native.messageBox({
        type: BOX_TYPE[opts.icon || 'info'] || 'none',
        title: P.T(opts.title || 'Paint'),
        message: main,
        detail: opts.main && opts.text ? P.T(opts.text) : null,
        buttons: labels.map(l => P.T(l)),
        defaultId: def,
        cancelId: cancel
      }).catch(() => -1).finally(() => { openCount-- })
    }
    return new Promise(resolve => {
      const text = h('div.msg-text')
      if (opts.main) text.appendChild(h('h3', { text: opts.main }))
      if (opts.text) text.appendChild(h('div', { text: opts.text }))
      Dl.open({
        title: opts.title || 'Paint',
        body: h('div.msg-body', null, h('div.msg-ic', { html: P.icons[opts.icon || 'info'] }), text),
        buttons: labels.map((l, i) => ({ label: l, default: i === def, cancel: i === cancel, value: i })),
        onClose: v => resolve(v)
      })
    })
  }
  Dl.alert = (text, icon, title) => Dl.message({ text, icon: icon || 'info', title })

  Dl.prompt = function (title, label, value) {
    return new Promise(resolve => {
      const inp = h('input.inp', { style: { width: '340px' }, value: value || '' })
      let result = null
      Dl.open({
        title,
        body: h('div', { style: { padding: '2px 2px 0' } }, h('div', { text: label, style: { marginBottom: '6px' } }), inp),
        buttons: [
          { label: 'ОК', default: true, action: () => { result = inp.value } },
          { label: 'Отмена', cancel: true }
        ],
        onClose: () => resolve(result)
      })
    })
  }

  const num = (v, w) => h('input.inp', { value: String(v), style: { width: (w || 60) + 'px' } })

  // ---------------------------------------------------------- resize & skew
  Dl.resize = function (baseW, baseH, resample) {
    return new Promise(resolve => {
      let mode = 'pct'
      const ih = num(100); const iv = num(100); const sh = num(0); const sv = num(0)
      const keep = h('input', { type: 'checkbox', checked: true })
      const rs = h('select.inp', { style: { width: '100%' } })
      for (const m of P.raster.RESAMPLE) rs.appendChild(h('option', { value: m, text: P.raster.RESAMPLE_NAMES[m] }))
      rs.value = resample || 'nearest'
      const rP = h('input', { type: 'radio', name: 'rsz', checked: true })
      const rX = h('input', { type: 'radio', name: 'rsz' })
      let lock = false
      const sync = (src) => {
        if (lock || !keep.checked) return
        lock = true
        const a = parseFloat(src === 'h' ? ih.value : iv.value)
        if (!isNaN(a)) {
          if (mode === 'pct') (src === 'h' ? iv : ih).value = String(Math.round(a))
          else if (src === 'h') iv.value = String(Math.max(1, Math.round(a * baseH / baseW)))
          else ih.value = String(Math.max(1, Math.round(a * baseW / baseH)))
        }
        lock = false
      }
      ih.addEventListener('input', () => sync('h'))
      iv.addEventListener('input', () => sync('v'))
      const setMode = m => {
        if (m === mode) return
        const hv = parseFloat(ih.value) || 100; const vv = parseFloat(iv.value) || 100
        if (m === 'px') { ih.value = String(Math.round(baseW * hv / 100)); iv.value = String(Math.round(baseH * vv / 100)) } else { ih.value = String(Math.round(hv / baseW * 100)); iv.value = String(Math.round(vv / baseH * 100)) }
        mode = m
      }
      rP.addEventListener('change', () => setMode('pct'))
      rX.addEventListener('change', () => setMode('px'))
      const iconH = '<svg width="24" height="16" viewBox="0 0 24 16"><rect x="1.5" y="3.5" width="21" height="9" fill="#cfe2f8" stroke="#3a70b8"/><path d="M4 8h16M4 8l3-2.5M4 8l3 2.5M20 8l-3-2.5M20 8l-3 2.5" stroke="#222" fill="none"/></svg>'
      const iconV = '<svg width="24" height="16" viewBox="0 0 24 16"><rect x="7.5" y="0.5" width="9" height="15" fill="#cfe2f8" stroke="#3a70b8"/><path d="M12 2v12M12 2l-2.5 3M12 2l2.5 3M12 14l-2.5-3M12 14l2.5-3" stroke="#222" fill="none"/></svg>'
      const iconSH = '<svg width="24" height="16" viewBox="0 0 24 16"><path d="M5.5 14.5h13l4-13h-13z" fill="#cfe2f8" stroke="#3a70b8"/></svg>'
      const iconSV = '<svg width="24" height="16" viewBox="0 0 24 16"><path d="M6.5 4.5v11l11-4v-11z" fill="#cfe2f8" stroke="#3a70b8"/></svg>'
      const row = (ic, label, inp) => h('div.form-row', null, h('span', { html: ic }), h('label.l', { text: label }), inp)
      const body = h('div', null,
        h('fieldset', null, h('legend', { text: 'Изменить размер' }),
          h('div.form-row', null, h('label.l', { text: 'По:' }), h('label.radio', null, rP, 'процентам'), h('label.radio', null, rX, 'пикселям')),
          row(iconH, 'По горизонтали:', ih), row(iconV, 'По вертикали:', iv),
          h('div.form-row', null, h('label.check', null, keep, 'Сохранить пропорции')),
          h('div.form-row', null, h('label', { text: 'Интерполяция:', style: { whiteSpace: 'nowrap' } }), rs)),
        h('fieldset', null, h('legend', { text: 'Наклон (градусы)' }), row(iconSH, 'По горизонтали:', sh), row(iconSV, 'По вертикали:', sv)))
      let result = null
      Dl.open({
        title: 'Изменение размеров и наклона',
        width: 320,
        body,
        buttons: [
          {
            label: 'ОК',
            default: true,
            action: () => {
              let w = parseFloat(ih.value); let hh = parseFloat(iv.value)
              const ax = parseFloat(sh.value) || 0; const ay = parseFloat(sv.value) || 0
              if (isNaN(w) || isNaN(hh) || w <= 0 || hh <= 0) { Dl.alert('Введите положительное число.', 'error'); return false }
              if (Math.abs(ax) > 89 || Math.abs(ay) > 89) { Dl.alert('Значение наклона должно быть от -89 до 89.', 'error'); return false }
              if (mode === 'pct') { w = baseW * w / 100; hh = baseH * hh / 100 }
              w = Math.max(1, Math.round(w)); hh = Math.max(1, Math.round(hh))
              if (w > 20000 || hh > 20000) { Dl.alert('Слишком большой размер изображения.', 'error'); return false }
              result = { w, h: hh, ax, ay, rs: rs.value }
            }
          },
          { label: 'Отмена', cancel: true }
        ],
        onClose: () => resolve(result)
      })
    })
  }

  // ---------------------------------------------------------- properties
  Dl.properties = function (info) {
    return new Promise(resolve => {
      const unitsK = { in: 96, cm: 96 / 2.54, px: 1 }
      let units = 'px'
      const iw = num(info.w, 70); const ihh = num(info.h, 70)
      const mk = (u, label) => {
        const r = h('input', { type: 'radio', name: 'units', checked: u === 'px' })
        r.addEventListener('change', () => {
          const w = parseFloat(iw.value) * unitsK[units]; const hh = parseFloat(ihh.value) * unitsK[units]
          units = u
          const f = v => u === 'px' ? String(Math.round(v)) : (v / unitsK[u]).toFixed(2).replace('.', ',')
          iw.value = f(w); ihh.value = f(hh)
        })
        return h('label.radio', null, r, label)
      }
      const parse = v => parseFloat(String(v).replace(',', '.'))
      const body = h('div', { style: { width: '330px' } },
        h('fieldset', null, h('legend', { text: 'Атрибуты файла' }),
          h('div.form-row', null, h('label.l', { text: 'Последнее сохранение:' }), h('span', { text: info.saved || 'Недоступно' })),
          h('div.form-row', null, h('label.l', { text: 'Размер на диске:' }), h('span', { text: info.size || 'Недоступно' })),
          h('div.form-row', null, h('label.l', { text: 'Разрешение:' }), h('span', { text: '96 точек на дюйм' }))),
        h('fieldset', null, h('legend', { text: 'Единицы измерения' }), h('div.form-row', null, mk('in', 'Дюймы'), mk('cm', 'Сантиметры'), mk('px', 'Пиксели'))),
        h('fieldset', null, h('legend', { text: 'Цвета' }), h('div.form-row', null,
          h('label.radio', null, h('input', { type: 'radio', name: 'cl', disabled: true }), 'Черно-белое'),
          h('label.radio', null, h('input', { type: 'radio', name: 'cl', checked: true }), 'Цветное'))),
        h('div.form-row', null, h('label', { text: 'Ширина:' }), iw, h('label', { text: 'Высота:', style: { marginLeft: '12px' } }), ihh,
          h('button.btn', { text: 'По умолчанию', style: { marginLeft: 'auto', minWidth: '0' }, onclick: () => { units = 'px'; iw.value = '1152'; ihh.value = '648'; U.$$('input[name=units]', body)[2].checked = true } })))
      let result = null
      Dl.open({
        title: 'Свойства изображения',
        body,
        buttons: [
          {
            label: 'ОК',
            default: true,
            action: () => {
              const w = Math.round(parse(iw.value) * unitsK[units]); const hh = Math.round(parse(ihh.value) * unitsK[units])
              if (!(w > 0 && hh > 0) || w > 20000 || hh > 20000) { Dl.alert('Введите допустимый размер изображения.', 'error'); return false }
              result = { w, h: hh }
            }
          },
          { label: 'Отмена', cancel: true }
        ],
        onClose: () => resolve(result)
      })
    })
  }

  // ---------------------------------------------------------- edit colors
  const BASIC = ['#FF8080', '#FFFF80', '#80FF80', '#00FF80', '#80FFFF', '#0080FF', '#FF80C0', '#FF80FF',
    '#FF0000', '#FFFF00', '#80FF00', '#00FF40', '#00FFFF', '#0080C0', '#8080C0', '#FF00FF',
    '#804040', '#FF8040', '#00FF00', '#008080', '#004080', '#8080FF', '#800040', '#FF0080',
    '#800000', '#FF8000', '#008000', '#008040', '#0000FF', '#0000A0', '#800080', '#8000FF',
    '#400000', '#804000', '#004000', '#004040', '#000080', '#000040', '#400040', '#400080',
    '#000000', '#808000', '#808040', '#808080', '#408080', '#C0C0C0', '#400040', '#FFFFFF']

  Dl.editColors = function (initial, customs) {
    return new Promise(resolve => {
      let rgb = initial.slice()
      let hsl = U.rgbToHsl240(rgb)
      const SW = 175; const SH = 187
      const spec = U.canvas(SW, SH); const sctx = spec.getContext('2d')
      const img = sctx.createImageData(SW, SH)
      for (let y = 0; y < SH; y++) {
        for (let x = 0; x < SW; x++) {
          const c = U.hsl240ToRgb(Math.round((x / (SW - 1)) * 239), Math.round((1 - y / (SH - 1)) * 240), 120)
          const k = (y * SW + x) * 4
          img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255
        }
      }
      sctx.putImageData(img, 0, 0)
      const lum = U.canvas(12, SH); const lctx = lum.getContext('2d')
      const cross = h('div.cd-cross', { html: '<svg width="19" height="19"><path d="M9.5 0v7M9.5 12v7M0 9.5h7M12 9.5h7" stroke="#000" stroke-width="3"/></svg>' })
      const arrow = h('div.cd-lum-arrow')
      const preview = h('div.cd-preview')
      const fields = {}
      const mkf = k => { fields[k] = h('input.inp'); fields[k].addEventListener('input', () => onField(k)); return fields[k] }
      const selCustom = { i: 0 }
      const customEls = []

      const drawLum = () => {
        for (let y = 0; y < SH; y++) {
          lctx.fillStyle = U.css(U.hsl240ToRgb(hsl[0], hsl[1], Math.round((1 - y / (SH - 1)) * 240)))
          lctx.fillRect(0, y, 12, 1)
        }
      }
      const refresh = (skip) => {
        cross.style.left = (hsl[0] / 239 * (SW - 1) + 1) + 'px'
        cross.style.top = ((1 - hsl[1] / 240) * (SH - 1) + 1) + 'px'
        arrow.style.top = ((1 - hsl[2] / 240) * (SH - 1) + 1) + 'px'
        preview.style.background = U.css(rgb)
        drawLum()
        const vals = { hue: hsl[0], sat: hsl[1], lum: hsl[2], r: rgb[0], g: rgb[1], b: rgb[2] }
        for (const k in vals) if (k !== skip) fields[k].value = String(vals[k])
      }
      const onField = k => {
        const v = parseInt(fields[k].value, 10)
        if (isNaN(v)) return
        if (k === 'hue' || k === 'sat' || k === 'lum') {
          const i = { hue: 0, sat: 1, lum: 2 }[k]
          hsl[i] = U.clamp(v, 0, i === 0 ? 239 : 240)
          rgb = U.hsl240ToRgb(hsl[0], hsl[1], hsl[2])
        } else {
          const i = { r: 0, g: 1, b: 2 }[k]
          rgb[i] = U.clamp(v, 0, 255)
          hsl = U.rgbToHsl240(rgb)
        }
        refresh(k)
      }
      const setRGB = c => { rgb = c.slice(); hsl = U.rgbToHsl240(rgb); refresh() }

      const specWrap = h('div.cd-spectrum', null, spec, cross)
      const drag = (el, fn) => el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId); fn(e)
        const mv = ev => fn(ev)
        const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up) }
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up)
      })
      drag(specWrap, e => {
        const r = spec.getBoundingClientRect()
        hsl[0] = Math.round(U.clamp((e.clientX - r.left) / (SW - 1), 0, 1) * 239)
        hsl[1] = Math.round(U.clamp(1 - (e.clientY - r.top) / (SH - 1), 0, 1) * 240)
        if (hsl[2] === 0 || hsl[2] === 240) hsl[2] = 120
        rgb = U.hsl240ToRgb(hsl[0], hsl[1], hsl[2]); refresh()
      })
      const lumWrap = h('div.cd-lum', null, lum, arrow)
      drag(lumWrap, e => {
        const r = lum.getBoundingClientRect()
        hsl[2] = Math.round(U.clamp(1 - (e.clientY - r.top) / (SH - 1), 0, 1) * 240)
        rgb = U.hsl240ToRgb(hsl[0], hsl[1], hsl[2]); refresh()
      })

      const basic = h('div.cd-grid')
      BASIC.forEach(hex => {
        const c = U.fromHex(hex)
        const sw = h('div.cd-sw', { style: { background: hex } })
        sw.addEventListener('click', () => { U.$$('.cd-sw.sel', basic.parentNode).forEach(x => x.classList.remove('sel')); sw.classList.add('sel'); setRGB(c) })
        basic.appendChild(sw)
      })
      const cust = h('div.cd-grid')
      for (let i = 0; i < 16; i++) {
        const c = customs[i]
        const sw = h('div.cd-sw', { style: { background: c ? U.css(c) : '#fff' } })
        sw.addEventListener('click', () => {
          U.$$('.cd-sw.sel', cust.parentNode).forEach(x => x.classList.remove('sel'))
          sw.classList.add('sel'); selCustom.i = i
          if (customs[i]) setRGB(customs[i])
        })
        customEls.push(sw)
        cust.appendChild(sw)
      }
      const addBtn = h('button.btn', { text: 'Добавить в набор', style: { width: '100%', marginTop: '8px' } })
      addBtn.addEventListener('click', () => {
        customs[selCustom.i] = rgb.slice()
        customEls[selCustom.i].style.background = U.css(rgb)
        selCustom.i = (selCustom.i + 1) % 16
      })
      const body = h('div.cdlg', null,
        h('div.cd-left', null,
          h('div', { text: 'Основные цвета:' }), basic,
          h('div', { text: 'Дополнительные цвета:' }), cust,
          h('button.btn', { text: 'Определить цвет >>', disabled: true, style: { width: '100%' } })),
        h('div.cd-right', null,
          h('div.cd-spec-row', null, specWrap, lumWrap),
          h('div.cd-fields', null,
            h('div', null, preview, h('div', { text: 'Цвет|Заливка' })),
            h('div.cd-nums', null,
              h('label', { text: 'Оттенок:' }), mkf('hue'), h('label', { text: 'Красный:' }), mkf('r'),
              h('label', { text: 'Контраст:' }), mkf('sat'), h('label', { text: 'Зеленый:' }), mkf('g'),
              h('label', { text: 'Яркость:' }), mkf('lum'), h('label', { text: 'Синий:' }), mkf('b'))),
          addBtn))
      refresh()
      let result = null
      Dl.open({
        title: 'Изменение цветов',
        body,
        buttons: [{ label: 'ОК', default: true, action: () => { result = rgb.slice() } }, { label: 'Отмена', cancel: true }],
        onClose: () => resolve(result)
      })
    })
  }

  // ---------------------------------------------------------- about
  Dl.about = function () {
    const v = P.app.version || '1.0'
    Dl.open({
      title: 'О программе Paint',
      width: 440,
      body: h('div', { style: { display: 'flex', gap: '14px', padding: '6px 4px 4px' } },
        h('div', { html: P.icons.app.replace('width="16" height="16"', 'width="64" height="64"') }),
        h('div', { style: { lineHeight: '18px' } },
          h('div', { style: { fontSize: '20px', fontWeight: '300', color: '#1e5aa8', marginBottom: '6px' }, text: 'Paint · Мультиплеер' }),
          h('div', { text: P.T('Версия {v}', { v }) }),
          h('div', { style: { marginTop: '8px' }, text: 'Клон Paint из Windows 7 с совместным рисованием по сети Steam.' }),
          h('div', { text: 'Сеть: Steamworks, AppID 480 (Spacewar), P2P через серверы Steam.' }),
          h('div', { style: { marginTop: '8px', color: '#555' }, text: 'Хост лобби упорядочивает операции; у всех игроков холст одинаковый, отмена (Ctrl+Z) работает для своих действий.' }))),
      buttons: [{ label: 'ОК', default: true, cancel: true }]
    })
  }

  // ---------------------------------------------------------- lobbies
  Dl.lobbyBrowser = function () {
    const S = P.net
    return new Promise(resolve => {
      const table = h('div.lobby-table')
      const status = h('div.muted', { style: { marginTop: '6px', minHeight: '15px' } })
      let selected = null
      let joinBtn
      const render = list => {
        table.innerHTML = ''
        table.appendChild(h('div.lobby-row.head', null, h('span.c1', { text: 'Хост' }), h('span.c2', { text: 'Игроков' }), h('span.c3', { text: 'Код лобби' })))
        if (!list.length) {
          table.appendChild(h('div.lobby-empty', { html: 'Открытых лобби Paint не найдено.<br>Создайте своё или попросите друга прислать код.' }))
          return
        }
        for (const l of list) {
          const row = h('div.lobby-row', null, h('span.c1', { text: l.host }), h('span.c2', { text: l.members + (l.max ? ' / ' + l.max : '') }), h('span.c3', { text: l.id }))
          row.addEventListener('click', () => { U.$$('.lobby-row.sel', table).forEach(x => x.classList.remove('sel')); row.classList.add('sel'); selected = l.id; joinBtn.disabled = false })
          row.addEventListener('dblclick', () => { selected = l.id; joinBtn.click() })
          table.appendChild(row)
        }
      }
      const refresh = async () => {
        status.textContent = P.T('Поиск лобби…')
        selected = null; if (joinBtn) joinBtn.disabled = true
        const r = await S.listLobbies()
        if (!r.ok) { status.textContent = P.T('Ошибка: {e}', { e: P.T(r.error) }); render([]); return }
        render(r.lobbies)
        status.textContent = P.T('Найдено лобби: {n}', { n: r.lobbies.length }) + (r.filtered === false ? P.T(' (без фильтра Steam — показаны только ближайшие)') : '')
      }
      const refreshBtn = h('button.btn', { text: 'Обновить', onclick: refresh })
      const body = h('div', null, table, h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, status, h('div', { style: { flex: 1 } }), refreshBtn))
      let result = null
      const d = Dl.open({
        title: 'Найти лобби',
        body,
        buttons: [
          { label: 'Подключиться', default: true, action: () => { if (!selected) return false; result = selected } },
          { label: 'Отмена', cancel: true }
        ],
        onClose: () => resolve(result)
      })
      joinBtn = d.el.querySelector('.btn.default')
      joinBtn.disabled = true
      render([])
      refresh()
    })
  }

  // ---------------------------------------------------------- invite friends
  // Paint's own list of Steam friends (the Steam overlay often can't draw over
  // the window). An invite arrives in the friend's Steam chat; their Paint
  // must be running to accept it.
  Dl.inviteFriends = function () {
    const api = window.native && window.native.steam
    if (!api || !api.friendList) return
    const STATE = { 0: 'Не в сети', 1: 'В сети', 2: 'Не беспокоить', 3: 'Нет на месте', 4: 'Спит', 5: 'Хочет обменяться', 6: 'Хочет поиграть', 7: 'Невидимка' }
    const list = h('div.friend-list')
    const status = h('div.muted', { style: { minHeight: '15px' } })
    const search = h('input.inp', { placeholder: P.T('Поиск друзей'), style: { flex: '1' } })
    const showOff = h('input', { type: 'checkbox' })
    const invited = new Set()
    let friends = []
    let timer = 0
    const render = () => {
      const q = search.value.trim().toLowerCase()
      list.innerHTML = ''
      const rank = f => f.member ? 3 : f.paint ? 0 : f.state > 0 ? 1 : 2
      const shown = friends
        .filter(f => (showOff.checked || f.state > 0 || f.member) && (!q || f.name.toLowerCase().includes(q)))
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      if (!shown.length) {
        list.appendChild(h('div.lobby-empty', { text: friends.length ? 'Никого не найдено.' : 'Друзей в сети нет.' }))
        return
      }
      for (const f of shown) {
        const st = f.member ? 'Уже в лобби' : f.paint ? 'Запустил Paint / Spacewar' : f.game ? 'В игре' : STATE[f.state] || ''
        const btn = h('button.btn', { text: invited.has(f.id) ? 'Приглашён' : 'Пригласить', disabled: f.member || invited.has(f.id) })
        btn.addEventListener('click', async () => {
          btn.disabled = true
          const r = await api.inviteFriend(f.id)
          if (r && r.ok) { invited.add(f.id); btn.textContent = P.T('Приглашён') } else {
            btn.disabled = false
            status.textContent = P.T('Ошибка: {e}', { e: P.T((r && r.error) || '?') })
          }
        })
        list.appendChild(h('div.friend' + (f.state > 0 ? '' : '.off'), null,
          h('span.pav', { style: f.avatar ? { backgroundImage: 'url("' + f.avatar + '")' } : null }),
          h('span.fname', null, h('b', { text: f.name }), h('span', { text: st, class: f.paint ? 'fpaint' : null })),
          btn))
      }
    }
    const refresh = async () => {
      const r = await api.friendList()
      if (!r || !r.ok) { status.textContent = P.T('Ошибка: {e}', { e: P.T((r && r.error) || '?') }); friends = []; render(); return }
      friends = r.friends
      const online = friends.filter(f => f.state > 0).length
      status.textContent = P.T('Друзей в сети: {n} из {m}', { n: online, m: friends.length })
      render()
    }
    search.addEventListener('input', render)
    search.addEventListener('keydown', e => e.stopPropagation())
    showOff.addEventListener('change', render)
    const body = h('div', { style: { width: '420px' } },
      h('div', { style: { marginBottom: '6px', lineHeight: '17px' }, text: 'Приглашение придёт другу в чат Steam. У друга должен быть запущен этот Paint — тогда он подключится сам.' }),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' } }, search, h('label.check', null, showOff, 'Не в сети')),
      list, status)
    Dl.open({
      title: 'Пригласить друзей',
      body,
      buttons: [
        { label: 'Оверлей Steam', action: () => { P.net.invite(); return false } },
        { label: 'Закрыть', default: true, cancel: true }
      ],
      onClose: () => clearInterval(timer)
    })
    render()
    refresh()
    // avatars and statuses arrive from Steam over time
    timer = setInterval(refresh, 4000)
  }

  Dl.lobbyCreated = function (id) {
    const code = h('div.code-box', { text: id })
    Dl.open({
      title: 'Лобби создано',
      width: 470,
      body: h('div', { style: { lineHeight: '18px', padding: '2px' } },
        h('div', { text: 'Лобби создано, вы — хост. Код лобби:' }),
        h('div', { style: { display: 'flex', gap: '8px', margin: '6px 0 10px' } }, code,
          h('button.btn', { text: 'Копировать', onclick: () => P.app.copyText(id) })),
        h('div', { text: 'Как друг может подключиться:' }),
        h('div', { text: '1. Друг запускает этот Paint (Steam должен быть запущен).' }),
        h('div', { text: '2. Вы жмёте «Пригласить друзей» — друг принимает приглашение в Steam,' }),
        h('div', { text: '    либо друг жмёт «Войти по коду» и вводит код выше,' }),
        h('div', { text: '    либо «Найти лобби» (если лобби публичное).' })),
      buttons: [
        { label: 'Пригласить друзей', action: () => { setTimeout(() => P.app.inviteFriends(), 0) } },
        { label: 'ОК', default: true, cancel: true }
      ]
    })
  }
})(window.P)
