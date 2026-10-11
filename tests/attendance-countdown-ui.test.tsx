// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/client", () => ({ api: m.api }));
import { useAttendanceCooldown } from "../src/components/use-attendance-cooldown";
import { AttendanceCountdown } from "../src/components/attendance-countdown";
function Harness() {
  const cooldown = useAttendanceCooldown();
  return (
    <>
      <p data-testid="state">{cooldown.status}</p>
      <button disabled={cooldown.blocked}>تسجيل الحضور</button>
      <button onClick={() => void cooldown.refresh()}>إعادة التحقق</button>
      <button
        onClick={() =>
          cooldown.acceptCooldown({
            serverNow: "2026-10-11T00:00:00Z",
            nextAllowedAt: "2026-10-11T10:00:00Z",
          })
        }
      >
        تعارض جديد
      </button>
      {cooldown.status === "cooldown" && cooldown.times && (
        <AttendanceCountdown
          remaining={cooldown.remaining}
          nextAllowedAt={cooldown.times.nextAllowedAt}
        />
      )}
    </>
  );
}
const reply = {
  state: "cooldown",
  serverNow: "2026-10-11T00:00:00.000Z",
  nextAllowedAt: "2026-10-11T00:00:02.000Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "Date", "performance"],
  });
  vi.setSystemTime(new Date("2036-01-01"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function mount() {
  await act(async () => {
    render(<Harness />);
  });
}
const blocked = () =>
  (screen.getByRole("button", { name: "تسجيل الحضور" }) as HTMLButtonElement)
    .disabled;
describe("live countdown accuracy and lifecycle", () => {
  it("ignores a stale ready response after a newer registration conflict", async () => {
    let resolve!: (value: unknown) => void;
    m.api.mockResolvedValueOnce({ state: "ready" }).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await mount();
    await act(async () => {
      fireEvent.focus(window);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "تعارض جديد" }));
    });
    await act(async () => {
      resolve({ state: "ready" });
    });
    expect(blocked()).toBe(true);
    expect(screen.getByText("10")).toBeTruthy();
  });
  it("ignores client clock skew and keeps registration disabled at zero until server revalidation", async () => {
    let resolve!: (value: unknown) => void;
    m.api.mockResolvedValueOnce(reply).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await mount();
    expect(screen.getByText("02")).toBeTruthy();
    expect(blocked()).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(blocked()).toBe(true);
    expect(screen.getByText("جارٍ التحقق من إمكانية التسجيل…")).toBeTruthy();
    await act(async () => {
      resolve({ state: "ready", serverNow: reply.nextAllowedAt });
    });
    expect(blocked()).toBe(false);
    expect(m.api).toHaveBeenCalledTimes(2);
    expect(
      m.api.mock.calls.every(([url]) => url === "/api/attendance/cooldown"),
    ).toBe(true);
  });
  it("restores cooldown from the server after refresh and removes interval timers on unmount", async () => {
    m.api.mockResolvedValue(reply);
    await mount();
    expect(vi.getTimerCount()).toBe(1);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    await mount();
    expect(blocked()).toBe(true);
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(m.api).toHaveBeenCalledTimes(2);
  });
  it("blocks on network failure and enables only after successful retry", async () => {
    m.api
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ state: "ready" });
    await mount();
    expect(screen.getByTestId("state").textContent).toBe("error");
    expect(blocked()).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إعادة التحقق" }));
    });
    expect(blocked()).toBe(false);
  });
  it("revalidates on tab return and accepts a newer server deadline", async () => {
    m.api.mockResolvedValueOnce(reply).mockResolvedValueOnce({
      state: "cooldown",
      serverNow: "2026-10-11T01:00:00Z",
      nextAllowedAt: "2026-10-11T11:00:00Z",
    });
    await mount();
    await act(async () => {
      fireEvent.focus(window);
    });
    expect(screen.getByText("10")).toBeTruthy();
    expect(blocked()).toBe(true);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );
  });
});
