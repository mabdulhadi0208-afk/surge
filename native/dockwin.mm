// surge-dockwin.node: makes Surge Dock's Electron window behave like the Dock (Surge 3.0.5). Electron cannot set
// these itself:
//   - stationary: it stays put in Mission Control instead of zooming away with the app windows, like Apple's Dock
//   - on every desktop, and (when asked) in fullscreen apps' Spaces too
//   - skipped by Cmd+` window cycling
//   - at the Dock's own window level
// makeDock(nativeWindowHandle: Buffer, fullscreen: boolean) -> boolean. Runs on the main thread (Electron's main
// process JS does). Any problem returns false and changes nothing.
#include <node_api.h>
#import <AppKit/AppKit.h>

static napi_value Bool(napi_env env, bool v) { napi_value r; napi_get_boolean(env, v, &r); return r; }

static napi_value MakeDock(napi_env env, napi_callback_info info) {
  size_t argc = 2; napi_value args[2];
  if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok || argc < 1) return Bool(env, false);
  bool isBuf = false; napi_is_buffer(env, args[0], &isBuf);
  if (!isBuf) return Bool(env, false);
  void* data = NULL; size_t len = 0;
  if (napi_get_buffer_info(env, args[0], &data, &len) != napi_ok || !data || len < sizeof(void*)) return Bool(env, false);
  bool fullscreen = false;
  if (argc > 1) napi_get_value_bool(env, args[1], &fullscreen);
  if (![NSThread isMainThread]) return Bool(env, false);
  NSView* view = (__bridge NSView*)(*(void**)data);
  if (!view || ![view isKindOfClass:[NSView class]]) return Bool(env, false);
  NSWindow* win = [view window];
  if (!win) return Bool(env, false);
  NSWindowCollectionBehavior b = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorStationary | NSWindowCollectionBehaviorIgnoresCycle;
  if (fullscreen) b |= NSWindowCollectionBehaviorFullScreenAuxiliary;
  [win setCollectionBehavior:b];
  [win setLevel:CGWindowLevelForKey(kCGDockWindowLevelKey)];
  return Bool(env, true);
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, "makeDock", NAPI_AUTO_LENGTH, MakeDock, NULL, &fn);
  napi_set_named_property(env, exports, "makeDock", fn);
  return exports;
}
