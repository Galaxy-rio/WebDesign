/** A select-only combobox that keeps the native select as the form/event source. */
interface SelectControl {
  select: HTMLSelectElement;
  trigger: HTMLButtonElement;
  caption: HTMLSpanElement;
  menu: HTMLDivElement;
  lifecycle: AbortController;
  originalTabIndex: string | null;
  originalAriaHidden: string | null;
  active: number;
  query: string;
  queryTime: number;
  fallbackDialog: HTMLDialogElement | null;
  originalOverflow: string;
}

function enhanceSelects() {
  const controls = new Map<HTMLSelectElement, SelectControl>();
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  const hasPopover = 'showPopover' in HTMLElement.prototype;
  let opened: SelectControl | null = null;
  let serial = 0;

  function disabled(option: HTMLOptionElement) {
    return option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
  }

  function available(control: SelectControl) {
    return Array.from(control.select.options, (option, index) => ({ option, index }))
      .filter(({ option }) => !disabled(option) && !option.hidden);
  }

  function accessibleName(select: HTMLSelectElement) {
    const labelledBy = select.getAttribute('aria-labelledby');
    if (labelledBy) return labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
    if (select.getAttribute('aria-label')) return select.getAttribute('aria-label')!;
    return Array.from(select.labels ?? []).map(label => {
      const clone = label.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('select,.theme-select-trigger').forEach(element => element.remove());
      return clone.textContent?.trim() ?? '';
    }).join(' ').trim() || select.name || 'Choose an option';
  }

  function sync(control: SelectControl) {
    const { select, trigger, caption, menu } = control;
    const value = select.selectedOptions[0]?.label ?? '';
    if (caption.textContent !== value) caption.textContent = value;
    if (trigger.disabled !== select.matches(':disabled')) trigger.disabled = select.matches(':disabled');
    if (trigger.hidden !== select.hidden) trigger.hidden = select.hidden;
    const label = accessibleName(select);
    trigger.setAttribute('aria-label', label);
    menu.setAttribute('aria-label', label);
    for (const attribute of ['aria-describedby', 'aria-invalid', 'aria-errormessage', 'title']) {
      const value = select.getAttribute(attribute);
      if (value === null) trigger.removeAttribute(attribute);
      else trigger.setAttribute(attribute, value);
    }
    trigger.setAttribute('aria-required', String(select.required));
    if (opened === control && (trigger.disabled || trigger.hidden || !trigger.getClientRects().length)) close();
  }

  function drawOptions(control: SelectControl) {
    const { select, menu } = control;
    const fragment = document.createDocumentFragment();
    let group: Element | null = null;
    Array.from(select.options).forEach((option, index) => {
      if (option.hidden) return;
      if (option.parentElement instanceof HTMLOptGroupElement && group !== option.parentElement) {
        group = option.parentElement;
        const heading = document.createElement('div');
        heading.className = 'theme-select-group';
        heading.textContent = option.parentElement.label;
        heading.setAttribute('role', 'presentation');
        fragment.append(heading);
      }
      const item = document.createElement('div');
      item.id = `${menu.id}-option-${index}`;
      item.className = 'theme-select-option';
      item.dataset.optionIndex = String(index);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === select.selectedIndex));
      item.setAttribute('aria-disabled', String(disabled(option)));
      item.textContent = option.label;
      fragment.append(item);
    });
    menu.replaceChildren(fragment);
  }

  function highlight(control: SelectControl, index: number, scroll = true) {
    const options = available(control);
    if (!options.some(option => option.index === index)) {
      index = options.find(option => option.index === control.select.selectedIndex)?.index ?? options[0]?.index ?? -1;
    }
    control.active = index;
    control.trigger.removeAttribute('aria-activedescendant');
    control.menu.querySelectorAll<HTMLElement>('[data-option-index]').forEach(item => {
      const active = Number(item.dataset.optionIndex) === index;
      item.classList.toggle('is-active', active);
      if (active) {
        control.trigger.setAttribute('aria-activedescendant', item.id);
        if (scroll) item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function place(control: SelectControl) {
    const rect = control.trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const margin = 10, gap = 5;
    const below = viewportTop + viewportHeight - rect.bottom - margin - gap;
    const above = rect.top - viewportTop - margin - gap;
    const upwards = below < Math.min(240, control.menu.scrollHeight) && above > below;
    const maxHeight = Math.max(80, Math.min(320, upwards ? above : below));
    const width = Math.min(Math.max(rect.width, 155), viewportWidth - margin * 2);
    control.menu.style.width = `${width}px`;
    control.menu.style.maxHeight = `${maxHeight}px`;
    let left = Math.max(viewportLeft + margin, Math.min(rect.left, viewportLeft + viewportWidth - width - margin));
    let top = upwards ? rect.top - Math.min(maxHeight, control.menu.scrollHeight) - gap : rect.bottom + gap;
    if (control.fallbackDialog) {
      // Backdrop-filter makes a dialog a containing block on pre-Popover browsers.
      const owner = control.fallbackDialog;
      const ownerRect = owner.getBoundingClientRect();
      left -= ownerRect.left + owner.clientLeft;
      top -= ownerRect.top + owner.clientTop;
      top += owner.scrollTop;
    }
    control.menu.style.left = `${left}px`;
    control.menu.style.top = `${top}px`;
    control.menu.dataset.side = upwards ? 'above' : 'below';
  }

  function close(restoreFocus = false) {
    const control = opened;
    if (!control) return;
    opened = null;
    control.trigger.setAttribute('aria-expanded', 'false');
    control.trigger.removeAttribute('aria-activedescendant');
    if (hasPopover && control.menu.matches(':popover-open')) control.menu.hidePopover();
    control.menu.hidden = true;
    document.body.append(control.menu);
    if (control.fallbackDialog) {
      control.fallbackDialog.style.overflow = control.originalOverflow;
      control.fallbackDialog = null;
    }
    control.query = '';
    if (restoreFocus && control.trigger.isConnected && !control.trigger.disabled) control.trigger.focus({ preventScroll: true });
  }

  function open(control: SelectControl) {
    sync(control);
    if (control.trigger.disabled || !control.trigger.getClientRects().length || !available(control).length) return;
    if (opened === control) return;
    close();
    opened = control;
    drawOptions(control);
    const ownerDialog = control.select.closest<HTMLDialogElement>('dialog[open]');
    (ownerDialog ?? document.body).append(control.menu);
    control.menu.hidden = false;
    if (hasPopover) control.menu.showPopover();
    else if (ownerDialog) {
      control.fallbackDialog = ownerDialog;
      control.originalOverflow = ownerDialog.style.overflow;
      ownerDialog.style.overflow = 'visible';
    }
    control.menu.classList.toggle('in-dialog-fallback', !!control.fallbackDialog);
    control.trigger.setAttribute('aria-expanded', 'true');
    control.trigger.focus({ preventScroll: true });
    const selected = available(control).find(({ index }) => index === control.select.selectedIndex);
    place(control);
    highlight(control, selected?.index ?? available(control)[0].index);
  }

  function restoreAfterChange(control: SelectControl, scope: ParentNode, identity: [string, string][], index: number, direction: number) {
    // The editor can rebuild the entire inspector synchronously in its change handler.
    // Find the same field in that new DOM, rather than focusing its detached old button.
    const fields = Array.from(scope.querySelectorAll<HTMLSelectElement>('select'));
    const select = control.select.isConnected ? control.select : identity.length
      ? fields.find(candidate => identity.every(([name, value]) => candidate.getAttribute(name) === value)) : fields[index];
    if (!select) return;
    enhance(select);
    const trigger = controls.get(select)?.trigger;
    if (!trigger || trigger.disabled || !trigger.getClientRects().length) return;
    if (!direction) {
      // Respect an intentional focus move made by a change handler, for example opening a dialog.
      if (document.activeElement === control.trigger || document.activeElement === document.body || document.activeElement === null) {
        trigger.focus({ preventScroll: true });
      }
      return;
    }
    const dialog = trigger.closest<HTMLDialogElement>('dialog[open]');
    const owner = dialog ?? document.body;
    const focusable = Array.from(owner.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href],[tabindex],summary'))
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled,[hidden],.theme-select-native')
        && !element.closest('[inert],[hidden],.theme-select-menu') && element.getClientRects().length)
      .map((element, order) => ({ element, order }))
      .sort((a, b) => (a.element.tabIndex || Infinity) - (b.element.tabIndex || Infinity) || a.order - b.order)
      .map(item => item.element);
    const at = focusable.indexOf(trigger);
    if (at < 0) return;
    const next = at + direction;
    const target = focusable[next] ?? (dialog ? focusable[(next + focusable.length) % focusable.length] : null);
    if (target) target.focus();
    else trigger.focus({ preventScroll: true });
  }

  function choose(control: SelectControl, direction = 0) {
    const option = control.select.options[control.active];
    if (!option || disabled(option) || control.select.matches(':disabled')) { close(); return; }
    const scope = control.select.parentElement?.closest('[id]') ?? document.body;
    const identity: [string, string][] = Array.from(control.select.attributes)
      .filter(attribute => ['id', 'name', 'aria-label', 'data-choice', 'data-text-control', 'data-image-choice'].includes(attribute.name))
      .map(attribute => [attribute.name, attribute.value]);
    const index = Array.from(scope.querySelectorAll('select')).indexOf(control.select);
    const changed = control.select.selectedIndex !== control.active;
    control.select.selectedIndex = control.active;
    sync(control);
    close();
    if (changed) {
      // Existing app handlers continue to receive the native select, including its data attributes.
      control.select.dispatchEvent(new Event('input', { bubbles: true }));
      control.select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    queueMicrotask(() => restoreAfterChange(control, scope, identity, index, direction));
  }

  function keyboard(event: KeyboardEvent, control: SelectControl) {
    // Keep editor shortcuts from changing the artwork while a form control has focus.
    event.stopPropagation();
    if (event.key === 'Tab') {
      if (opened === control) { event.preventDefault(); choose(control, event.shiftKey ? -1 : 1); }
      return;
    }
    if (event.key === 'Escape') {
      if (opened === control) { event.preventDefault(); close(true); }
      return;
    }
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      if (opened === control) choose(control);
      return;
    }
    if (event.ctrlKey || event.metaKey || (event.altKey && event.key !== 'ArrowDown')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (opened === control) choose(control); else open(control);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const wasOpen = opened === control;
      open(control);
      const options = available(control);
      if (!options.length) return;
      const at = options.findIndex(({ index }) => index === control.active);
      let next = at;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = options.length - 1;
      else if (wasOpen) next = Math.max(0, Math.min(options.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
      highlight(control, options[Math.max(0, next)].index);
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      open(control);
      const now = performance.now();
      control.query = now - control.queryTime > 650 ? event.key : control.query + event.key;
      control.queryTime = now;
      const query = control.query.toLocaleLowerCase();
      const repeated = Array.from(query).every(character => character === query[0]);
      const search = repeated ? query[0] : query;
      const options = available(control);
      const at = options.findIndex(({ index }) => index === control.active);
      const start = repeated ? at + 1 : Math.max(0, at);
      for (let offset = 0; offset < options.length; offset++) {
        const candidate = options[(start + offset) % options.length];
        if (candidate.option.label.trim().toLocaleLowerCase().startsWith(search)) {
          highlight(control, candidate.index);
          break;
        }
      }
    }
  }

  function enhance(select: HTMLSelectElement) {
    if (controls.has(select) || select.multiple || select.size > 1 || select.dataset.nativeSelect !== undefined) return;
    const hadFocus = document.activeElement === select;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'theme-select-trigger';
    trigger.tabIndex = select.tabIndex;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const caption = document.createElement('span');
    caption.className = 'theme-select-caption';
    trigger.append(caption);
    const menu = document.createElement('div');
    menu.className = 'theme-select-menu';
    menu.id = `theme-select-menu-${++serial}`;
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    if (hasPopover) menu.setAttribute('popover', 'manual');
    trigger.setAttribute('aria-controls', menu.id);
    document.body.append(menu);
    const control: SelectControl = {
      select, trigger, caption, menu, lifecycle: new AbortController(),
      originalTabIndex: select.getAttribute('tabindex'), originalAriaHidden: select.getAttribute('aria-hidden'),
      active: select.selectedIndex, query: '', queryTime: 0, fallbackDialog: null, originalOverflow: '',
    };
    controls.set(select, control);
    const { signal } = control.lifecycle;
    select.after(trigger);
    select.classList.add('theme-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    sync(control);
    trigger.addEventListener('click', event => {
      // A button inside a label must not activate that label's hidden native select.
      event.preventDefault();
      event.stopPropagation();
      if (opened === control) close(); else open(control);
    }, { signal });
    trigger.addEventListener('keydown', event => keyboard(event, control), { signal });
    trigger.addEventListener('focus', () => sync(control), { signal });
    select.addEventListener('focus', () => trigger.focus(), { signal });
    select.addEventListener('invalid', event => { event.preventDefault(); trigger.focus(); trigger.setAttribute('aria-invalid', 'true'); }, { signal });
    for (const type of ['input', 'change']) select.addEventListener(type, () => sync(control), { signal });
    menu.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') event.preventDefault(); }, { signal });
    menu.addEventListener('pointermove', event => {
      const item = (event.target as Element).closest<HTMLElement>('[data-option-index]');
      if (item && item.getAttribute('aria-disabled') !== 'true') highlight(control, Number(item.dataset.optionIndex), false);
    }, { signal });
    menu.addEventListener('click', event => {
      event.stopPropagation();
      const item = (event.target as Element).closest<HTMLElement>('[data-option-index]');
      if (item && item.getAttribute('aria-disabled') !== 'true') { control.active = Number(item.dataset.optionIndex); choose(control); }
    }, { signal });
    if (hadFocus && !trigger.disabled) trigger.focus({ preventScroll: true });
  }

  function destroy(control: SelectControl) {
    if (opened === control) close();
    control.lifecycle.abort();
    control.trigger.remove();
    control.menu.remove();
    control.select.classList.remove('theme-select-native');
    for (const [attribute, value] of [['tabindex', control.originalTabIndex], ['aria-hidden', control.originalAriaHidden]]) {
      if (value === null) control.select.removeAttribute(attribute!); else control.select.setAttribute(attribute!, value!);
    }
    controls.delete(control.select);
  }

  function scan(root: ParentNode) {
    if (root instanceof HTMLSelectElement) enhance(root);
    root.querySelectorAll<HTMLSelectElement>('select').forEach(enhance);
  }

  const observer = new MutationObserver(records => {
    for (const control of controls.values()) {
      if (!control.select.isConnected || control.select.multiple || control.select.size > 1) destroy(control);
    }
    for (const record of records) {
      record.addedNodes.forEach(node => { if (node instanceof Element) scan(node); });
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      const select = element?.closest('select');
      if (select instanceof HTMLSelectElement) {
        enhance(select);
        const control = controls.get(select);
        if (control) {
          sync(control);
          if (opened === control) { drawOptions(control); place(control); highlight(control, control.active); }
        }
      } else if (record.type === 'attributes' && ['disabled', 'hidden', 'open'].includes(record.attributeName ?? '')) {
        controls.forEach(sync);
      }
    }
  });
  scan(document);
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['disabled', 'selected', 'label', 'value', 'hidden', 'open', 'multiple', 'size', 'required', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-invalid', 'aria-errormessage', 'title'],
  });

  document.addEventListener('pointerdown', event => {
    if (opened && !opened.menu.contains(event.target as Node) && !opened.trigger.contains(event.target as Node)) close();
  }, { capture: true, signal });
  document.addEventListener('click', event => {
    const target = event.target as Element;
    const label = target.closest('label');
    const select = target instanceof HTMLSelectElement ? target : label?.control;
    if (!(select instanceof HTMLSelectElement) || target.closest('.theme-select-trigger')) return;
    const control = controls.get(select);
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    open(control);
  }, { capture: true, signal });
  document.addEventListener('focusin', event => {
    if (opened && !opened.trigger.contains(event.target as Node) && !opened.menu.contains(event.target as Node)) close();
  }, { signal });
  document.addEventListener('scroll', event => {
    if (opened && !opened.menu.contains(event.target as Node)) close();
  }, { capture: true, signal });
  document.addEventListener('cancel', event => {
    if (opened) { event.preventDefault(); event.stopPropagation(); close(true); }
  }, { capture: true, signal });
  document.addEventListener('close', () => close(), { capture: true, signal });
  document.addEventListener('reset', () => queueMicrotask(() => controls.forEach(sync)), { signal });
  window.addEventListener('resize', () => close(), { signal });
  window.visualViewport?.addEventListener('resize', () => close(), { signal });
  window.visualViewport?.addEventListener('scroll', () => close(), { signal });
  window.addEventListener('blur', () => close(), { signal });
  window.addEventListener('pagehide', event => {
    close();
    if (!event.persisted) dispose();
  }, { signal });
  function dispose() {
    close();
    observer.disconnect();
    lifecycle.abort();
    controls.forEach(destroy);
  }
  return dispose;
}

const dispose = enhanceSelects();
if (import.meta.hot) import.meta.hot.dispose(dispose);
