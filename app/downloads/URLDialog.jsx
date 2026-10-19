// ../pub-game-store/native/downloads/URLDialog.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Inter-Regular.ttf';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { Keyboard } from '../search/Keyboard.jsx';
import { Button2 } from '../ui/Button.jsx';
import { cancellation } from '../state/download-sources.js';
import { FocusScope, Text, View } from '@ps5-react/core';

  function URLDialog({ title, detail: detail2, initial = "https://", submit, onClose, secret = false, confirmLabel, pendingLabel }) {
    const t2 = useT();
    const [value, setValue] = (0, useState)(initial);
    const [error2, setError] = (0, useState)("");
    const [pending, setPending] = useState(false);
    const current = useRef(null);
    useEffect(() => () => { current.current?.cancel(); current.current = null; }, []);
    const close = () => {
      current.current?.cancel();
      current.current = null;
      onClose();
    };
    const done = async () => {
      if (current.current) return;
      const operation = cancellation();
      current.current = operation;
      setPending(true);
      setError("");
      try {
        await submit(value, { signal: operation.signal });
        if (!operation.signal.aborted) onClose();
      } catch (failure) {
        if (!operation.signal.aborted) setError(failure.message);
      } finally {
        if (current.current === operation) {
          current.current = null;
          setPending(false);
        }
      }
    };
    return (
      // A modal: actions the keyboard leaves (L1/R1, Square outside it) stop here instead of reaching the page.
      /* @__PURE__ */ (0, jsx)(FocusScope, { trap: true, autoFocus: true, onBack: () => {
        close();
        return true;
      }, onAction: (action) => {
        if (action === "r2") done();
        return true;
      }, children: /* @__PURE__ */ (0, jsx)(View, { style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, alignItems: "center", justifyContent: "center", backgroundColor: "#000000f2" }, children: /* @__PURE__ */ (0, jsxs)(View, { style: { width: 1380, gap: 30, borderRadius: 18, borderWidth: 2, borderColor: "#2a2a2f", backgroundColor: "#17171a", padding: 48 }, children: [
        /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 36, color: "#f2f2f3", lineHeight: 48 }, children: title }),
        /* @__PURE__ */ (0, jsxs)(View, { style: { flexDirection: "row", gap: 48 }, children: [
          /* @__PURE__ */ (0, jsx)(Keyboard, { url: true, onChange: (next) => { if (!current.current) { setValue(next); setError(""); } }, onSubmit: done }),
          /* @__PURE__ */ (0, jsxs)(View, { style: { width: 600, gap: 30 }, children: [
            /* @__PURE__ */ (0, jsx)(Text, { style: { width: 600, fontFamily: "Inter-Regular", fontSize: 24, color: "#a3a3ab", numberOfLines: 5, ellipsizeMode: "tail", lineHeight: 36 }, children: detail2 }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { width: 600, direction: "ltr", writingDirection: "ltr", textAlign: "left", fontFamily: "Inter-Regular", fontSize: 24, color: "#f2f2f3", numberOfLines: 5, ellipsizeMode: "tail", lineHeight: 36 }, children: (secret ? "*".repeat(Math.min(value.length, 60)) : value.slice(-180)) || t2("urlDialog.empty") }),
            error2 ? /* @__PURE__ */ (0, jsx)(Text, { style: { width: 600, fontFamily: "Inter-Regular", fontSize: 21, color: "#f2f2f3", numberOfLines: 3, ellipsizeMode: "tail", lineHeight: 30 }, children: error2 }) : null,
            /* @__PURE__ */ (0, jsx)(Button2, { label: pending ? pendingLabel || t2("sources.check.checking") : confirmLabel || t2("urlDialog.confirm"), onPress: done }),
            /* @__PURE__ */ (0, jsx)(Button2, { label: t2("urlDialog.cancel"), variant: "outline", onPress: close }),
            /* @__PURE__ */ (0, jsx)(Text, { style: { fontFamily: "Inter-Regular", fontSize: 21, color: "#a3a3ab", lineHeight: 30 }, children: t2("urlDialog.controls") })
          ] })
        ] })
      ] }) }) })
    );
  }

export { URLDialog };
