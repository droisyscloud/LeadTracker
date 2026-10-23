"use client";
import { useEffect, useRef, useState } from "react";
import { decodeCanvas } from "./qr";

/**
 * Full-screen live camera that watches for a QR code. When it finds one it closes and hands back
 * the code and a still of the badge (so the printed text can be read too).
 */
export function QrScanner({ onResult, onClose }: { onResult: (text: string, still: Blob | null) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState(""); const [ready, setReady] = useState(false);
  useEffect(() => {
    let stream: MediaStream | null = null; let stop = false; let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!; v.srcObject = stream; v.setAttribute("playsinline", "true"); await v.play(); setReady(true);
        const tick = async () => {
          if (stop) return;
          const c = canvas.current!; const w = v.videoWidth, h = v.videoHeight;
          if (w && h) {
            const k = Math.min(1, 960 / Math.max(w, h)); c.width = Math.round(w * k); c.height = Math.round(h * k);
            c.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, c.width, c.height);
            const text = await decodeCanvas(c).catch(() => null);
            if (text && !stop) {
              stop = true; navigator.vibrate?.(60);
              // a sharper still for reading the printed name and company
              const full = document.createElement("canvas"); full.width = w; full.height = h; full.getContext("2d")!.drawImage(v, 0, 0);
              const still = await new Promise<Blob | null>((r) => full.toBlob(r, "image/jpeg", 0.85));
              stream?.getTracks().forEach((t) => t.stop()); onResult(text, still); return;
            }
          }
          timer = setTimeout(tick, 160);
        };
        tick();
      } catch (e) {
        const n = (e as DOMException).name;
        setErr(n === "NotAllowedError" ? "Camera access was blocked. Allow the camera for this site in your phone's settings, then try again." : n === "NotFoundError" ? "No camera was found on this device." : "The camera couldn't be started.");
      }
    })();
    return () => { stop = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onResult]);
  return <div className="qrs" role="dialog" aria-label="Scan a QR code">
    <video ref={video} muted playsInline className="qrs-video" />
    <canvas ref={canvas} hidden />
    <div className="qrs-frame" aria-hidden="true" />
    <div className="qrs-top"><b>Point at the badge's QR code</b><button type="button" onClick={onClose}>Close</button></div>
    <div className="qrs-bottom">{err || (ready ? "Hold steady, it reads by itself." : "Starting the camera…")}</div>
  </div>;
}
