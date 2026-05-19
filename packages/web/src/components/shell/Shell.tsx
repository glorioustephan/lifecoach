import { Outlet } from "@tanstack/react-router";
import { RailNav } from "./RailNav";
import { TabBar } from "./TabBar";

/**
 * Top-level layout chrome.
 *
 * Mobile (sm-): viewport-tall column with a fixed top header (composer-area
 * inside views) and bottom tab bar.
 * Laptop (md+): persistent 240px left rail + flex content area.
 */
export const Shell = (): JSX.Element => {
  return (
    <div className="flex h-dvh w-full">
      <RailNav />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
};
