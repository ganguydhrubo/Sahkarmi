/**
 * The Mac desktop helper: one JavaScript for Automation (JXA) script, run by /usr/bin/osascript
 * once per request with the JSON request as its only argument. It answers with one JSON line on
 * stdout, the same shapes as the Windows host (desktop-host-script.ts), so desktop-control.ts and
 * the tools need no Mac branch. No native helper: CoreGraphics (through the JXA ObjC bridge) for
 * the window list, mouse and keys, System Events for the accessibility tree, focus and typing.
 *
 * Coordinates are macOS "points" from the top-left of the main display (the same space as
 * CoreGraphics events), so read_ui, list_windows and click all agree.
 */
export const DESKTOP_MAC_SCRIPT = String.raw`
ObjC.import('Cocoa');
ObjC.import('CoreGraphics');
ObjC.import('ApplicationServices');

var PROTECTED = [];
var NO_TYPING = ['securityagent', 'loginwindow', 'coreautha', 'localauthenticationremoteservice', 'universalaccessauthwarn'];
var SE = null;

function systemEvents() {
  if (!SE) SE = Application('System Events');
  return SE;
}

function PermissionError(kind, message) {
  var error = new Error(message);
  error.permission = kind;
  return error;
}

var MESSAGES = {
  accessibility: "macOS has not allowed Sahkarmi to use the mouse and keyboard yet. Open System Settings > Privacy & Security > Accessibility, switch on Sahkarmi, then try again.",
  screen: "macOS has not allowed Sahkarmi to see the screen yet. Open System Settings > Privacy & Security > Screen & System Audio Recording (Screen Recording), switch on Sahkarmi, then try again.",
  automation: "macOS has not allowed Sahkarmi to control System Events yet. Open System Settings > Privacy & Security > Automation, switch on System Events under Sahkarmi, then try again."
};

function needAccessibility() {
  if (!$.AXIsProcessTrusted()) throw PermissionError('accessibility', MESSAGES.accessibility);
}

function screenAllowed() {
  if (typeof $.CGPreflightScreenCaptureAccess !== 'function') return true;
  return Boolean($.CGPreflightScreenCaptureAccess());
}

function needScreen() {
  if (!screenAllowed()) throw PermissionError('screen', MESSAGES.screen);
}

/** Turns an Apple Events refusal into the plain permission message. */
function explain(error) {
  if (error && error.permission) return error;
  var text = String((error && error.message) || error);
  var number = error && error.errorNumber;
  if (number === -1743 || /not authori[sz]ed to send apple events/i.test(text)) return PermissionError('automation', MESSAGES.automation);
  if (number === -1719 || number === -25211 || /assistive access/i.test(text)) return PermissionError('accessibility', MESSAGES.accessibility);
  return error;
}

function run(argv) {
  var request;
  try {
    request = JSON.parse(argv[0]);
  } catch (error) {
    return JSON.stringify({ ok: false, error: 'The desktop helper got an unreadable request.' });
  }
  PROTECTED = (request.protectedPids || []).map(Number);
  var reply = { ok: true };
  try {
    handle(request, reply);
  } catch (raw) {
    var error = explain(raw);
    var out = { ok: false, error: String((error && error.message) || error).replace(/^Error: /, '') };
    if (error && error.permission) out.permission = error.permission;
    return JSON.stringify(out);
  }
  return JSON.stringify(reply);
}

function handle(r, reply) {
  switch (r.op) {
    case 'ping': reply.dpi = 'points'; return;
    case 'permissions': permissions(reply); return;
    case 'list_windows': {
      var list = listWindows(r.includeMinimized !== false);
      reply.windows = list;
      var front = list.filter(function (w) { return w.foreground; })[0];
      reply.foreground = front ? front.handle : '';
      return;
    }
    case 'geometry': geometry(r, reply); return;
    case 'focus_window': reply.window = describe(focus(findWindow(r, true))); reply.focused = true; return;
    case 'cursor': {
      var event = $.CGEventCreate(null);
      var at = $.CGEventGetLocation(event);
      reply.x = Math.round(at.x); reply.y = Math.round(at.y);
      return;
    }
    case 'move': needAccessibility(); checkPoint(r.x, r.y, 'move the mouse over'); mouse(5, r.x, r.y, 0); reply.x = r.x; reply.y = r.y; return;
    case 'click': click(r, reply); return;
    case 'scroll': scroll(r, reply); return;
    case 'drag': drag(r, reply); return;
    case 'type': typeText(r, reply); return;
    case 'key': keys(r, reply); return;
    case 'close_window': closeWindow(r, reply); return;
    case 'read_ui': readUi(r, reply); return;
    case 'find_element': findElement(r, reply); return;
    default: throw new Error('Unknown request: ' + r.op);
  }
}

function permissions(reply) {
  reply.accessibility = Boolean($.AXIsProcessTrusted());
  reply.screen = screenAllowed();
  try {
    systemEvents().processes.whose({ frontmost: true })[0].name();
    reply.automation = true;
  } catch (error) {
    reply.automation = explain(error).permission === 'automation' ? false : true;
  }
}

// ------------------------------------------------------------------------------- displays

function displays() {
  var screens = $.NSScreen.screens.js;
  if (!screens.length) return [];
  var mainHeight = screens[0].frame.size.height;
  return screens.map(function (screen, index) {
    var frame = screen.frame;
    return {
      index: index,
      primary: index === 0,
      x: Math.round(frame.origin.x),
      y: Math.round(mainHeight - frame.origin.y - frame.size.height),
      width: Math.round(frame.size.width),
      height: Math.round(frame.size.height),
      scale: Number(screen.backingScaleFactor) || 1
    };
  });
}

function checkPoint(x, y, doing) {
  var all = displays();
  var inside = all.some(function (d) { return x >= d.x && y >= d.y && x < d.x + d.width && y < d.y + d.height; });
  if (!inside) {
    var spans = all.map(function (d) { return d.x + ',' + d.y + ' to ' + (d.x + d.width - 1) + ',' + (d.y + d.height - 1); }).join('; ');
    throw new Error('(' + x + ', ' + y + ') is off the screen; the screen spans ' + spans + '.');
  }
  var under = windowAt(x, y);
  if (under) guard(under, doing);
  return under;
}

// ------------------------------------------------------------------------------- windows

function cgWindows(onScreenOnly) {
  // 1 = on screen only, 16 = leave out desktop elements; 0 = every window.
  var info = $.CGWindowListCopyWindowInfo(onScreenOnly ? 17 : 16, 0);
  var list = ObjC.deepUnwrap(ObjC.castRefToObject(info)) || [];
  return list.filter(function (w) {
    var b = w.kCGWindowBounds;
    return w.kCGWindowLayer === 0 && b && b.Width > 40 && b.Height > 20 && w.kCGWindowOwnerName !== 'Window Server' && w.kCGWindowOwnerName !== 'Dock';
  });
}

function frontPid() {
  try {
    return Number($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);
  } catch (error) {
    return -1;
  }
}

function toWindow(w, minimized) {
  var b = w.kCGWindowBounds;
  return {
    number: Number(w.kCGWindowNumber),
    handle: '0x' + Number(w.kCGWindowNumber).toString(16),
    title: String(w.kCGWindowName || ''),
    process: String(w.kCGWindowOwnerName || ''),
    pid: Number(w.kCGWindowOwnerPID),
    x: Math.round(b.X),
    y: Math.round(b.Y),
    width: Math.round(b.Width),
    height: Math.round(b.Height),
    minimized: minimized
  };
}

/** Window titles need Screen Recording; without it they come from the accessibility tree. */
function fillTitles(windows) {
  var missing = {};
  windows.forEach(function (w) { if (!w.title && !w.minimized) missing[w.pid] = true; });
  Object.keys(missing).forEach(function (pid) {
    try {
      var proc = systemEvents().processes.whose({ unixId: Number(pid) })[0];
      var names = proc.windows.name();
      var places = proc.windows.position();
      windows.forEach(function (w) {
        if (w.pid !== Number(pid) || w.title) return;
        for (var i = 0; i < names.length; i++) {
          var p = places[i] || [];
          if (Math.abs(p[0] - w.x) <= 2 && Math.abs(p[1] - w.y) <= 2) { w.title = String(names[i] || ''); return; }
        }
      });
    } catch (error) {
      // No accessibility: the window keeps an empty title.
    }
  });
}

function listWindows(includeMinimized) {
  var shown = cgWindows(true).map(function (w) { return toWindow(w, false); });
  var seen = {};
  shown.forEach(function (w) { seen[w.number] = true; });
  var result = shown;
  if (includeMinimized) {
    cgWindows(false).forEach(function (w) {
      if (seen[w.kCGWindowNumber] || !w.kCGWindowName || w.kCGWindowIsOnscreen) return;
      result.push(toWindow(w, true));
    });
  }
  fillTitles(result);
  var front = frontPid();
  var marked = false;
  result.forEach(function (w) {
    w.sahkarmi = PROTECTED.indexOf(w.pid) >= 0;
    w.foreground = !marked && !w.minimized && w.pid === front;
    if (w.foreground) marked = true;
    w.maximized = false;
  });
  return result;
}

function describe(w) {
  if (!w) return null;
  return { handle: w.handle, title: w.title, process: w.process, pid: w.pid, x: w.x, y: w.y, width: w.width, height: w.height };
}

function guard(w, doing) {
  if (w && PROTECTED.indexOf(w.pid) >= 0) {
    throw new Error("That is Sahkarmi's own window. A coworker cannot " + doing + ' Sahkarmi itself; ask the owner in chat instead.');
  }
}

function windowAt(x, y) {
  var list = listWindows(false);
  for (var i = 0; i < list.length; i++) {
    var w = list[i];
    if (x >= w.x && y >= w.y && x < w.x + w.width && y < w.y + w.height) return w;
  }
  return null;
}

function findWindow(r, required) {
  var list = listWindows(true);
  if (r.handle) {
    var number = /^0x/i.test(r.handle) ? parseInt(r.handle, 16) : parseInt(r.handle, 10);
    var byHandle = list.filter(function (w) { return w.number === number; })[0];
    if (!byHandle) throw new Error('No window has the handle ' + r.handle + ' any more. List the windows again.');
    return byHandle;
  }
  if (r.title || r.pid) {
    var title = String(r.title || '').toLowerCase();
    var matches = list.filter(function (w) {
      if (r.pid && w.pid !== Number(r.pid)) return false;
      return !title || w.title.toLowerCase().indexOf(title) >= 0 || (title && w.process.toLowerCase() === title);
    });
    var open = matches.filter(function (w) { return !w.minimized; });
    var found = open[0] || matches[0];
    if (!found) throw new Error('No open window matches ' + (title ? '"' + r.title + '"' : 'pid ' + r.pid) + '. Call desktop_list_windows to see what is open.');
    return found;
  }
  if (required) throw new Error('Name the window: give a title, a pid or a handle from desktop_list_windows.');
  var front = list.filter(function (w) { return w.foreground; })[0] || list.filter(function (w) { return !w.minimized; })[0];
  return front || null;
}

function axProcess(pid) {
  return systemEvents().processes.whose({ unixId: pid })[0];
}

/** The accessibility window that matches a CoreGraphics window (same place, else same title). */
function axWindow(w) {
  var proc = axProcess(w.pid);
  var names = proc.windows.name();
  var places = proc.windows.position();
  var best = -1;
  for (var i = 0; i < names.length; i++) {
    var p = places[i] || [];
    if (!w.minimized && Math.abs(p[0] - w.x) <= 2 && Math.abs(p[1] - w.y) <= 2) { best = i; break; }
    if (best < 0 && w.title && String(names[i]) === w.title) best = i;
  }
  if (best < 0 && names.length) best = 0;
  if (best < 0) throw new Error('macOS shows no window for ' + w.process + ' that can be controlled.');
  return proc.windows[best];
}

function focus(w) {
  guard(w, 'bring to the front');
  needAccessibility();
  var app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(w.pid);
  if (app && !app.isNil()) app.activateWithOptions(3);
  try {
    var win = axWindow(w);
    try {
      if (win.attributes.byName('AXMinimized').value()) win.attributes.byName('AXMinimized').value = false;
    } catch (error) {}
    win.actions.byName('AXRaise').perform();
    axProcess(w.pid).frontmost = true;
  } catch (error) {
    var explained = explain(error);
    if (explained.permission) throw explained;
  }
  for (var i = 0; i < 15; i++) {
    delay(0.1);
    if (frontmostPid() === w.pid) return findWindow({ handle: w.handle }, true);
  }
  throw new Error('macOS did not let the window come to the front. Ask the owner to click it once, or try again.');
}

/** The front app as System Events sees it (fresh, unlike NSWorkspace inside one script run). */
function frontmostPid() {
  try {
    return Number(systemEvents().processes.whose({ frontmost: true })[0].unixId());
  } catch (error) {
    var explained = explain(error);
    if (explained.permission) throw explained;
    return frontPid();
  }
}

function frontmostName() {
  try {
    return String(systemEvents().processes.whose({ frontmost: true })[0].name()).toLowerCase();
  } catch (error) {
    return '';
  }
}

function closeWindow(r, reply) {
  var w = findWindow(r, true);
  guard(w, 'close');
  needAccessibility();
  reply.window = describe(w);
  var win = axWindow(w);
  var pressed = false;
  try {
    win.attributes.byName('AXCloseButton').value().actions.byName('AXPress').perform();
    pressed = true;
  } catch (error) {
    var explained = explain(error);
    if (explained.permission) throw explained;
  }
  if (!pressed) {
    focus(w);
    keyChord([], 13, 0x100000);
  }
  for (var i = 0; i < 12; i++) {
    delay(0.15);
    var still = listWindows(true).some(function (x) { return x.number === w.number; });
    if (!still) { reply.closed = true; return; }
  }
  reply.closed = false;
}

// ------------------------------------------------------------------------------- screenshot

function geometry(r, reply) {
  needScreen();
  var all = displays();
  reply.displays = all;
  if (r.title || r.pid || r.handle) {
    var w = findWindow(r, true);
    if (w.minimized) throw new Error('That window is minimized. Call desktop_focus_window first.');
    reply.window = describe(w);
    reply.left = w.x; reply.top = w.y; reply.width = w.width; reply.height = w.height;
    return;
  }
  if (r.allDisplays) {
    var left = Math.min.apply(null, all.map(function (d) { return d.x; }));
    var top = Math.min.apply(null, all.map(function (d) { return d.y; }));
    var right = Math.max.apply(null, all.map(function (d) { return d.x + d.width; }));
    var bottom = Math.max.apply(null, all.map(function (d) { return d.y + d.height; }));
    reply.left = left; reply.top = top; reply.width = right - left; reply.height = bottom - top;
    return;
  }
  var index = Number(r.display || 0);
  var d = all[index];
  if (!d) throw new Error('There is no display ' + index + '; this Mac has ' + all.length + '.');
  reply.left = d.x; reply.top = d.y; reply.width = d.width; reply.height = d.height;
}

// ------------------------------------------------------------------------------- mouse

var BUTTONS = {
  left: { down: 1, up: 2, drag: 6, button: 0 },
  right: { down: 3, up: 4, drag: 7, button: 1 },
  middle: { down: 25, up: 26, drag: 27, button: 2 }
};

function mouse(type, x, y, button, clickState) {
  var event = $.CGEventCreateMouseEvent(null, type, { x: x, y: y }, button);
  if (clickState) $.CGEventSetIntegerValueField(event, 1, clickState);
  $.CGEventPost(0, event);
}

function click(r, reply) {
  needAccessibility();
  var under = checkPoint(r.x, r.y, 'click');
  var b = BUTTONS[r.button || 'left'] || BUTTONS.left;
  mouse(5, r.x, r.y, 0);
  delay(0.05);
  var clicks = Number(r.clicks) || 1;
  for (var i = 1; i <= clicks; i++) {
    mouse(b.down, r.x, r.y, b.button, i);
    mouse(b.up, r.x, r.y, b.button, i);
  }
  reply.x = r.x; reply.y = r.y;
  if (under) reply.window = describe(under);
}

function scroll(r, reply) {
  needAccessibility();
  var under = checkPoint(r.x, r.y, 'scroll');
  if (typeof $.CGEventCreateScrollWheelEvent2 !== 'function') throw new Error('This macOS cannot scroll from the desktop helper.');
  mouse(5, r.x, r.y, 0);
  delay(0.05);
  // Line units; positive wheel 1 moves the content down (scrolls up), so the signs flip.
  var event = $.CGEventCreateScrollWheelEvent2(null, 1, 2, -Number(r.deltaY || 0), -Number(r.deltaX || 0), 0);
  $.CGEventPost(0, event);
  if (under) reply.window = describe(under);
}

function drag(r, reply) {
  needAccessibility();
  var under = checkPoint(r.fromX, r.fromY, 'drag in');
  checkPoint(r.toX, r.toY, 'drag into');
  var b = BUTTONS[r.button || 'left'] || BUTTONS.left;
  mouse(5, r.fromX, r.fromY, 0);
  delay(0.05);
  mouse(b.down, r.fromX, r.fromY, b.button, 1);
  for (var step = 1; step <= 12; step++) {
    var x = r.fromX + ((r.toX - r.fromX) * step) / 12;
    var y = r.fromY + ((r.toY - r.fromY) * step) / 12;
    mouse(b.drag, x, y, b.button);
    delay(0.02);
  }
  mouse(b.up, r.toX, r.toY, b.button, 1);
  if (under) reply.window = describe(under);
}

// ------------------------------------------------------------------------------- keyboard

function focusedIsPassword(pid) {
  try {
    var focused = axProcess(pid).attributes.byName('AXFocusedUIElement').value();
    return String(focused.subrole()) === 'AXSecureTextField';
  } catch (error) {
    return false;
  }
}

/** Who gets the keys; refuses Sahkarmi itself, sign-in prompts and password fields. */
function keyTarget(passwordSafe) {
  needAccessibility();
  var pid = frontmostPid();
  if (PROTECTED.indexOf(pid) >= 0) {
    throw new Error("Sahkarmi's own window is in front, so nothing was typed. Call desktop_focus_window on the app first.");
  }
  if (NO_TYPING.indexOf(frontmostName()) >= 0) {
    throw new Error('That is a macOS sign-in or password prompt. Coworkers never type there; ask the owner to do it.');
  }
  if (!passwordSafe && focusedIsPassword(pid)) {
    throw new Error('A password field has the keyboard focus. Coworkers never type passwords into apps; use sahkarmi request_secure_input in the browser, or ask the owner to type it.');
  }
  return pid;
}

var MODIFIER_CODES = [[0x100000, 55], [0x20000, 56], [0x80000, 58], [0x40000, 59]];

function keyEvent(code, down, flags) {
  var event = $.CGEventCreateKeyboardEvent(null, code, down);
  $.CGEventSetFlags(event, flags);
  $.CGEventPost(0, event);
}

/** One chord: modifiers down, the main key (if any), modifiers up. */
function keyChord(unused, code, flags) {
  var held = 0;
  MODIFIER_CODES.forEach(function (m) {
    if (flags & m[0]) { held |= m[0]; keyEvent(m[1], true, held); }
  });
  if (code >= 0) {
    keyEvent(code, true, flags);
    keyEvent(code, false, flags);
  }
  MODIFIER_CODES.slice().reverse().forEach(function (m) {
    if (flags & m[0]) { held &= ~m[0]; keyEvent(m[1], false, held); }
  });
}

function keys(r, reply) {
  var chords = r.macChords || [];
  if (!chords.length) throw new Error('No keys given.');
  var pid = keyTarget(Boolean(r.passwordSafe));
  var repeat = Math.max(1, Math.min(50, Number(r.repeat) || 1));
  for (var n = 0; n < repeat; n++) {
    for (var i = 0; i < chords.length; i++) {
      keyChord([], chords[i].code, chords[i].flags);
      delay(0.03);
    }
  }
  reply.pressed = chords.length * repeat;
  reply.window = describe(windowOf(pid));
}

function windowOf(pid) {
  var list = listWindows(false);
  return list.filter(function (w) { return w.pid === pid; })[0] || null;
}

function typeText(r, reply) {
  var text = String(r.text || '');
  if (!text) throw new Error('Missing text.');
  var pid = keyTarget(false);
  var plain = /^[\x20-\x7e\t\n\r]*$/.test(text);
  var method = r.method === 'paste' || (r.method !== 'keys' && (!plain || text.length > 300)) ? 'paste' : 'keys';
  if (method === 'keys' && !plain) method = 'paste';
  var typed = 0;
  if (method === 'keys') {
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i]) {
        systemEvents().keystroke(lines[i]);
        typed += lines[i].length;
      }
      if (i < lines.length - 1) {
        keyChord([], 36, 0);
        typed += 1;
      }
      if (frontmostPid() !== pid) {
        throw new Error('The focus moved to another window after ' + typed + ' characters, so typing stopped. Check the screen and focus the right window.');
      }
    }
  } else {
    var board = $.NSPasteboard.generalPasteboard;
    var old = board.stringForType($.NSPasteboardTypeString);
    var hadOld = old && !old.isNil();
    board.clearContents;
    board.setStringForType($(text), $.NSPasteboardTypeString);
    delay(0.05);
    if (frontmostPid() !== pid) throw new Error('The focus moved to another window, so nothing was pasted.');
    keyChord([], 9, 0x100000);
    delay(0.4);
    board.clearContents;
    if (hadOld) board.setStringForType(old, $.NSPasteboardTypeString);
    typed = text.length;
  }
  reply.typed = typed;
  reply.method = method;
  reply.window = describe(windowOf(pid));
}

// ------------------------------------------------------------------------------- the UI tree

function safe(fn) {
  try {
    return fn();
  } catch (error) {
    return null;
  }
}

/** Every child's attributes in a few Apple Events (one per attribute, not one per child). */
function children(el) {
  var kids = el.uiElements;
  var roles;
  try {
    roles = kids.role();
  } catch (error) {
    var explained = explain(error);
    if (explained.permission) throw explained;
    return [];
  }
  var n = roles.length;
  function column(fn) {
    var values = safe(fn);
    return values && values.length === n ? values : [];
  }
  var subroles = column(function () { return kids.subrole(); });
  var names = column(function () { return kids.name(); });
  var descriptions = column(function () { return kids.description(); });
  var values = column(function () { return kids.value(); });
  var positions = column(function () { return kids.position(); });
  var sizes = column(function () { return kids.size(); });
  var focused = column(function () { return kids.focused(); });
  var enabled = column(function () { return kids.enabled(); });
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push({
      element: kids[i],
      role: String(roles[i] || ''),
      subrole: String(subroles[i] || ''),
      name: String(names[i] || descriptions[i] || ''),
      value: values[i],
      position: positions[i],
      size: sizes[i],
      focused: focused[i] === true,
      enabled: enabled[i] !== false
    });
  }
  return out;
}

function toNode(item, depth) {
  var password = item.subrole === 'AXSecureTextField';
  var node = { depth: depth, type: (password ? 'AXTextField' : item.role).replace(/^AX/, '') };
  if (item.name) node.name = item.name.slice(0, 200);
  if (!password && item.value !== null && item.value !== undefined && typeof item.value !== 'object') {
    var value = String(item.value);
    if (value && value !== item.name) node.value = value.slice(0, 200);
  }
  if (item.position && item.size) {
    node.x = Math.round(item.position[0]);
    node.y = Math.round(item.position[1]);
    node.width = Math.round(item.size[0]);
    node.height = Math.round(item.size[1]);
  }
  if (item.focused) node.focused = true;
  if (!item.enabled) node.disabled = true;
  if (password) node.password = true;
  return node;
}

function walk(el, depth, state) {
  if (depth > state.maxDepth) return;
  var kids = children(el);
  for (var i = 0; i < kids.length; i++) {
    if (state.nodes.length >= state.maxNodes) { state.truncated = true; return; }
    state.nodes.push(toNode(kids[i], depth));
    if (depth < state.maxDepth) walk(kids[i].element, depth + 1, state);
  }
}

function uiWindow(r, doing) {
  var w = findWindow(r, false);
  if (!w) throw new Error('No window is in front. Name one with title or pid.');
  guard(w, doing);
  if (w.minimized) throw new Error('That window is minimized. Call desktop_focus_window first.');
  needAccessibility();
  return w;
}

function readUi(r, reply) {
  var w = uiWindow(r, 'read');
  var win = axWindow(w);
  var state = {
    nodes: [{ depth: 0, type: 'Window', name: w.title, x: w.x, y: w.y, width: w.width, height: w.height }],
    maxDepth: Math.max(1, Math.min(25, Number(r.maxDepth) || 12)),
    maxNodes: Math.max(10, Math.min(1500, Number(r.maxNodes) || 400)),
    truncated: false
  };
  walk(win, 1, state);
  reply.window = describe(w);
  reply.nodes = state.nodes;
  reply.truncated = state.truncated;
}

var TYPE_ALIASES = {
  edit: ['textfield', 'textarea', 'combobox', 'searchfield'],
  document: ['textarea', 'webarea'],
  hyperlink: ['link'],
  text: ['statictext'],
  listitem: ['row', 'cell', 'statictext'],
  dataitem: ['row', 'cell'],
  tabitem: ['radiobutton', 'tab'],
  menuitem: ['menuitem', 'menubaritem'],
  checkbox: ['checkbox'],
  radiobutton: ['radiobutton'],
  button: ['button', 'menubutton', 'popupbutton']
};

function typeMatches(type, wanted) {
  if (!wanted) return true;
  var t = type.toLowerCase();
  var w = String(wanted).toLowerCase().replace(/[^a-z]/g, '');
  if (t.indexOf(w) >= 0) return true;
  return (TYPE_ALIASES[w] || []).indexOf(t) >= 0;
}

function findElement(r, reply) {
  var w = uiWindow(r, 'read');
  var win = axWindow(w);
  var state = { nodes: [], maxDepth: 25, maxNodes: 1500, truncated: false };
  walk(win, 1, state);
  var name = String(r.name || '').toLowerCase().trim();
  var usable = state.nodes.filter(function (node) {
    return node.width > 0 && node.height > 0 && !node.disabled && typeMatches(node.type, r.controlType);
  });
  var exact = usable.filter(function (node) { return String(node.name || '').toLowerCase().trim() === name; });
  var partial = usable.filter(function (node) { return String(node.name || '').toLowerCase().indexOf(name) >= 0; });
  var found = exact[0] || partial[0];
  if (!found) {
    throw new Error('No visible control named "' + r.name + '"' + (r.controlType ? ' of type ' + r.controlType : '') + ' in "' + w.title + '". Call desktop_read_ui to see the controls.');
  }
  reply.element = { name: found.name || '', type: found.type, x: found.x, y: found.y, width: found.width, height: found.height };
  reply.window = describe(w);
}
`;
