"use client";

import type { Current } from "@/lib/types";
import { num, timeAgo, uptimeLabel } from "@/lib/format";

export default function StationHealth({
  current, now,
}: { current: Current; now: number }) {
  const charging = current.charging_state === 1;
  const fault = current.fault ?? null;
  const tiltX = current.tilt_x_deg ?? null;
  const tiltY = current.tilt_y_deg ?? null;
  const tilt =
    tiltX !== null && tiltY !== null
      ? Math.sqrt(tiltX * tiltX + tiltY * tiltY)
      : null;

  return (
    <section className="tile" style={{ ["--tile-hue" as string]: "var(--muted)" }}>
      <h2>Station</h2>
      <p className="tile-note">Power, level and radio link</p>

      <table className="readout">
        <tbody>
          <tr>
            <th>Battery</th>
            <td>{num(current.battery_v, 2)} V</td>
          </tr>
          <tr>
            <th>Solar input</th>
            <td>
              {num(current.solar_v, 2)} V{" "}
              <span className={`flag ${charging ? "ok" : ""}`}>
                {charging ? "charging" : "idle"}
              </span>
            </td>
          </tr>
          <tr>
            <th>Mast tilt</th>
            <td>
              {tilt === null ? "—" : `${num(tilt, 1)}°`}
              {tilt !== null && tilt > 3 && <span className="flag warn" style={{ marginLeft: 6 }}>check level</span>}
            </td>
          </tr>
          <tr>
            <th>Signal</th>
            <td>{num(current.rssi, 0)} dBm, SNR {num(current.snr, 1)}</td>
          </tr>
          <tr>
            <th>Uptime</th>
            <td>{current.uptime_s ? uptimeLabel(current.uptime_s) : "—"}</td>
          </tr>
          <tr>
            <th>Last uplink</th>
            <td>{timeAgo(current.last_seen, now)}</td>
          </tr>
          {fault !== null && fault !== 0 && (
            <tr>
              <th>Fault flag</th>
              <td><span className="flag warn">set ({fault})</span></td>
            </tr>
          )}
        </tbody>
      </table>

      {fault !== null && fault !== 0 && (
        <p className="tile-note" style={{ margin: "0.75rem 0 0" }}>
          The logger is reporting a fault code. Check what bit {fault} means in the
          METER documentation before treating it as a problem.
        </p>
      )}
    </section>
  );
}
