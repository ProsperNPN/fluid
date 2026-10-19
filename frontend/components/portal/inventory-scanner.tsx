"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Upload, ScanLine } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api";
import {
  scanUnit,
  type InventoryUnit,
} from "@/services/smart-inventory-service";
import { PortalDialog } from "./portal-ui";
import type { IScannerControls } from "@zxing/browser";

export function InventoryScanner({
  onFound,
  onClose,
}: {
  onFound: (unit: InventoryUnit) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    controls = useRef<IScannerControls | null>(null),
    running = useRef(true),
    resolving = useRef(false);
  function stop() {
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream)
      stream.getTracks().forEach((t) => t.stop());
    setActive(false);
  }
  useEffect(() => {
    running.current = true;
    const node = video.current;
    return () => {
      running.current = false;
      controls.current?.stop();
      const stream = node?.srcObject;
      if (stream instanceof MediaStream)
        stream.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function resolve(text: string) {
    if (resolving.current) return;
    resolving.current = true;
    setBusy(true);
    setError("");
    try {
      const unit = await scanUnit(text);
      if (running.current) {
        stop();
        onFound(unit);
      }
    } catch (e) {
      if (running.current)
        setError(
          getApiErrorMessage(e, "Code not recognized in this hospital."),
        );
    } finally {
      resolving.current = false;
      if (running.current) setBusy(false);
    }
  }
  async function camera() {
    setError("");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (!window.isSecureContext)
        throw new Error(
          "Camera requires localhost or HTTPS. Upload an image or enter the code instead.",
        );
      const reader = new BrowserQRCodeReader();
      setActive(true);
      const control = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" }, audio: false },
        video.current!,
        (result) => {
          if (result) void resolve(result.getText());
        },
      );
      if (!running.current) control.stop();
      else controls.current = control;
    } catch (e) {
      stop();
      setError(
        e instanceof Error
          ? e.message
          : "Camera unavailable. Upload a QR image or enter the code.",
      );
    }
  }
  async function upload(file: File) {
    setError("");
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      await resolve(result.getText());
    } catch {
      setError(
        "No readable FLUID QR code found. Try a clearer image or enter the internal code.",
      );
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }
  return (
    <PortalDialog title="Scan inventory QR" onClose={onClose}>
      <div className="portal-stack">
        <p className="portal-muted">
          Scan a FLUID internal QR. Official blood-bank labels remain the source
          of product identification. Camera access starts only when you select
          Start camera.
        </p>
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className={`w-full rounded-xl bg-slate-100 ${active ? "" : "hidden"}`}
        />
        <div className="portal-dialog-actions">
          <button
            className="portal-button"
            disabled={active || busy}
            onClick={() => void camera()}
          >
            <Camera size={16} />
            Start camera
          </button>
          {active && (
            <button
              className="portal-button portal-button--secondary"
              onClick={stop}
            >
              Stop camera
            </button>
          )}
          <label className="portal-button portal-button--secondary cursor-pointer">
            <Upload size={16} />
            Upload QR image
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
        </div>
        <form
          className="portal-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void resolve(value);
          }}
        >
          <label className="portal-field">
            Internal code or QR payload
            <input
              required
              maxLength={200}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <button className="portal-button" disabled={busy}>
            <ScanLine size={16} />
            {busy ? "Looking up…" : "Find unit"}
          </button>
        </form>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
    </PortalDialog>
  );
}
