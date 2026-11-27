// surge-dock: Surge Dock's helper for macOS (Surge 3.0.5).
//
// Surge starts it from Surge.app/Contents/MacOS/surge-dock and talks to it over stdin/stdout, one JSON object per
// line. It does the two things Electron cannot:
//   1. Keeps windows clear of Surge Dock, the way macOS keeps them clear of Apple's Dock: when a window is zoomed or
//      filled to the screen edge, or opens reaching under the Dock, it is resized to stop just above Surge Dock.
//      Windows you drag under the Dock yourself are left alone, as with Apple's Dock. Uses the Accessibility API,
//      which Surge already has permission for.
//   2. Tells Surge when the app in front is in fullscreen, so Surge Dock can hide and slide up from the edge there.
//
// In:  {"cmd":"zone","x":0,"y":1040,"w":1920,"h":76,"edge":"bottom","sx":0,"sy":0,"sw":1920,"sh":1080}
//        the band Surge Dock covers and the screen it is on, in global top-left coordinates (as Electron and AX use)
//      {"cmd":"keepclear","on":true}
//      {"cmd":"check"}            report fullscreen state now
// Out: {"ev":"ready","ax":true,"protocol":1}
//      {"ev":"fullscreen","on":true}
//      {"ev":"cleared","app":"Safari"}
//      {"ev":"ax","on":false}      Accessibility was turned off or on
//
// Idle cost: none. No timers; only Accessibility observers on the apps you use and workspace notifications.
// It exits as soon as Surge closes stdin (Surge quit or crashed).
//
// CLI: surge-dock --selftest   print {"ok":true,"ax":bool,"fullscreen":bool} and exit 0
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

let PROTOCOL = 1

func emit(_ obj: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(obj), let d = try? JSONSerialization.data(withJSONObject: obj, options: []) else { return }
    var bytes = [UInt8](d); bytes.append(10)
    bytes.withUnsafeBufferPointer { p in
        var off = 0
        while off < p.count { let n = write(1, p.baseAddress! + off, p.count - off); if n <= 0 { return }; off += n }
    }
}

// MARK: - Accessibility helpers

func axCopy(_ el: AXUIElement, _ attr: String) -> CFTypeRef? {
    var v: CFTypeRef?
    return AXUIElementCopyAttributeValue(el, attr as CFString, &v) == .success ? v : nil
}
func axFrame(_ w: AXUIElement) -> CGRect? {
    guard let p = axCopy(w, kAXPositionAttribute as String), let s = axCopy(w, kAXSizeAttribute as String),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var pt = CGPoint.zero, sz = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &pt), AXValueGetValue(s as! AXValue, .cgSize, &sz) else { return nil }
    return CGRect(origin: pt, size: sz)
}
func axSetFrame(_ w: AXUIElement, _ r: CGRect) {
    var pt = r.origin, sz = r.size
    if let v = AXValueCreate(.cgPoint, &pt) { AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, v) }
    if let v = AXValueCreate(.cgSize, &sz) { AXUIElementSetAttributeValue(w, kAXSizeAttribute as CFString, v) }
}
func axBool(_ el: AXUIElement, _ attr: String) -> Bool { (axCopy(el, attr) as? Bool) ?? false }
func axString(_ el: AXUIElement, _ attr: String) -> String? { axCopy(el, attr) as? String }

// MARK: - state

struct Zone { var band: CGRect; var screen: CGRect; var edge: String }
var zone: Zone? = nil
var keepClear = false
var axOn = AXIsProcessTrusted()
var observers: [pid_t: AXObserver] = [:]
var pending: [Int: DispatchWorkItem] = [:]
var created = Set<Int>()            // windows that just opened: placed like Apple's Dock places new windows
var lastFullscreen: Bool? = nil
let myPid = ProcessInfo.processInfo.processIdentifier
let parentPid = getppid()

// MARK: - keeping windows clear of the Dock

// What Apple's Dock does: a window that reaches the Dock's edge of the screen (zoomed, filled, or opened that big)
// is fitted to the space beside the Dock. A window you drag partly under the Dock is not touched.
func fit(_ w: AXUIElement, isNew: Bool) {
    guard keepClear, axOn, let z = zone else { return }
    if axBool(w, "AXFullScreen") || axBool(w, kAXMinimizedAttribute as String) { return }
    if let sub = axString(w, kAXSubroleAttribute as String), sub != (kAXStandardWindowSubrole as String) { return }
    guard var f = axFrame(w), f.width > 80, f.height > 80 else { return }
    guard f.intersects(z.band), f.midX >= z.screen.minX, f.midX <= z.screen.maxX else { return }
    let gap: CGFloat = 6
    if z.edge == "top" {
        let reachesEdge = f.minY <= z.band.minY + 4 || isNew
        guard reachesEdge, f.minY < z.band.maxY else { return }
        let newTop = z.band.maxY + gap
        let bottom = isNew ? min(f.maxY + (newTop - f.minY), z.screen.maxY) : f.maxY
        guard bottom - newTop >= 160 else { return }
        f = CGRect(x: f.minX, y: newTop, width: f.width, height: bottom - newTop)
    } else {
        let reachesEdge = f.maxY >= z.screen.maxY - 4 || isNew
        guard reachesEdge, f.maxY > z.band.minY else { return }
        let limit = z.band.minY - gap
        if isNew && f.height <= limit - z.screen.minY - 30 {
            f.origin.y = max(z.screen.minY + 25, limit - f.height)       // a new window that fits: move it up instead
        } else {
            guard limit - f.minY >= 160 else { return }
            f.size.height = limit - f.minY
        }
    }
    axSetFrame(w, f)
    if let app = NSRunningApplication(processIdentifier: pidOf(w)) { emit(["ev": "cleared", "app": app.localizedName ?? ""]) }
}
func pidOf(_ el: AXUIElement) -> pid_t { var p: pid_t = 0; AXUIElementGetPid(el, &p); return p }

// Zooming sends a burst of moved and resized notifications: act once it has settled.
func schedule(_ w: AXUIElement, isNew: Bool) {
    let key = Int(CFHash(w))
    if isNew { created.insert(key) }
    pending[key]?.cancel()
    let item = DispatchWorkItem {
        pending[key] = nil
        let wasNew = created.remove(key) != nil
        fit(w, isNew: wasNew)
    }
    pending[key] = item
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: item)
}

let callback: AXObserverCallback = { _, element, notification, _ in
    let n = notification as String
    if n == (kAXWindowCreatedNotification as String) {
        watchWindow(element)
        schedule(element, isNew: true)
    } else if n == (kAXWindowResizedNotification as String) || n == (kAXWindowMovedNotification as String) {
        schedule(element, isNew: false)
    } else if n == (kAXFocusedWindowChangedNotification as String) {
        if let w = axCopy(element, kAXFocusedWindowAttribute as String), CFGetTypeID(w) == AXUIElementGetTypeID() { watchWindow(w as! AXUIElement) }
        else { watchWindow(element) }
    }
}

func watchWindow(_ w: AXUIElement) {
    let pid = pidOf(w)
    guard let o = observers[pid] else { return }
    for n in [kAXWindowResizedNotification, kAXWindowMovedNotification] { AXObserverAddNotification(o, w, n as CFString, nil) }
}

func watchApp(_ pid: pid_t) {
    guard keepClear, axOn, pid != myPid, pid != parentPid, observers[pid] == nil else { return }
    var obs: AXObserver?
    guard AXObserverCreate(pid, callback, &obs) == .success, let o = obs else { return }
    observers[pid] = o
    let app = AXUIElementCreateApplication(pid)
    for n in [kAXWindowCreatedNotification, kAXFocusedWindowChangedNotification] { AXObserverAddNotification(o, app, n as CFString, nil) }
    CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(o), .defaultMode)
    if let ws = axCopy(app, kAXWindowsAttribute as String) as? [AXUIElement] { for w in ws { watchWindow(w) } }
}

func unwatchAll() {
    for (_, o) in observers { CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(o), .defaultMode) }
    observers.removeAll()
}

// MARK: - fullscreen

// The app in front is fullscreen when one of its normal windows covers the whole Dock screen, menu bar included.
func frontIsFullscreen() -> Bool {
    guard let app = NSWorkspace.shared.frontmostApplication else { return false }
    let pid = app.processIdentifier
    let screen: CGRect = zone?.screen ?? {
        guard let s = NSScreen.screens.first else { return .zero }
        return CGRect(x: 0, y: 0, width: s.frame.width, height: s.frame.height)
    }()
    guard screen.width > 0, let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
    for w in list {
        guard (w[kCGWindowOwnerPID as String] as? Int32) == pid, (w[kCGWindowLayer as String] as? Int) == 0,
              let bd = w[kCGWindowBounds as String] as? NSDictionary, let b = CGRect(dictionaryRepresentation: bd) else { continue }
        if abs(b.minX - screen.minX) < 2 && abs(b.minY - screen.minY) < 2 && abs(b.width - screen.width) < 2 && abs(b.height - screen.height) < 2 { return true }
    }
    return false
}
func reportFullscreen(force: Bool = false) {
    let fs = frontIsFullscreen()
    if force || fs != lastFullscreen { lastFullscreen = fs; emit(["ev": "fullscreen", "on": fs]) }
}
// entering or leaving fullscreen is an animated Space switch: look again as it settles
func reportFullscreenSoon() { for t in [0.15, 0.7, 1.4] { DispatchQueue.main.asyncAfter(deadline: .now() + t) { reportFullscreen() } } }

// MARK: - commands

func handle(_ line: String) {
    guard let d = line.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any], let cmd = o["cmd"] as? String else { return }
    func num(_ k: String) -> CGFloat { CGFloat((o[k] as? NSNumber)?.doubleValue ?? 0) }
    switch cmd {
    case "zone":
        zone = Zone(band: CGRect(x: num("x"), y: num("y"), width: num("w"), height: num("h")),
                    screen: CGRect(x: num("sx"), y: num("sy"), width: num("sw"), height: num("sh")),
                    edge: (o["edge"] as? String) ?? "bottom")
    case "keepclear":
        keepClear = (o["on"] as? Bool) ?? false
        if keepClear { if let a = NSWorkspace.shared.frontmostApplication { watchApp(a.processIdentifier) } } else { unwatchAll() }
    case "check":
        reportFullscreen(force: true)
    default: break
    }
}

// MARK: - main

if CommandLine.arguments.contains("--selftest") {
    emit(["ok": true, "ax": AXIsProcessTrusted(), "fullscreen": frontIsFullscreen(), "protocol": PROTOCOL])
    exit(0)
}

signal(SIGPIPE, SIG_IGN)
let nc = NSWorkspace.shared.notificationCenter
nc.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { n in
    if let a = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication { watchApp(a.processIdentifier) }
    reportFullscreenSoon()
}
nc.addObserver(forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main) { _ in reportFullscreenSoon() }
nc.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { n in
    if let a = n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication, let o = observers.removeValue(forKey: a.processIdentifier) {
        CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(o), .defaultMode)
    }
}
// Accessibility can be switched on or off while Surge runs
DistributedNotificationCenter.default().addObserver(forName: NSNotification.Name("com.apple.accessibility.api"), object: nil, queue: .main) { _ in
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        let now = AXIsProcessTrusted()
        if now != axOn { axOn = now; emit(["ev": "ax", "on": now]); if !now { unwatchAll() } else if keepClear, let a = NSWorkspace.shared.frontmostApplication { watchApp(a.processIdentifier) } }
    }
}

Thread {
    while let line = readLine(strippingNewline: true) { DispatchQueue.main.async { handle(line) } }
    DispatchQueue.main.async { exit(0) }      // Surge closed stdin: Surge quit or crashed
}.start()

emit(["ev": "ready", "ax": axOn, "protocol": PROTOCOL])
reportFullscreen(force: true)
RunLoop.main.run()
