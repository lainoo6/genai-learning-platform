// @vitest-environment jsdom

import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/en.json";
import { I18nProvider } from "@/i18n/client";
import { MatchGame } from "./MatchGame";

describe("MatchGame learner behavior", () => {
  it("uses buttons for incorrect continuation and successful matching", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const onFinish = vi.fn();
    const view = render(
      <I18nProvider locale="en" messages={en}>
        <MatchGame
          completed={false}
          onComplete={onComplete}
          onFinish={onFinish}
          pairs={[
            { left: "One", right: "First" },
            { left: "Two", right: "Second" },
          ]}
        />
      </I18nProvider>,
    );

    const left = (label: string) =>
      within(view.container).getByRole("button", { name: label });
    const rightButtons = () =>
      within(view.container).getAllByRole("button", {
        name: /First|Second/,
      });

    fireEvent.click(left("One"));
    fireEvent.click(rightButtons().find((button) => button.textContent === "Second")!);
    vi.advanceTimersByTime(600);
    fireEvent.click(left("One"));
    fireEvent.click(rightButtons().find((button) => button.textContent === "First")!);
    fireEvent.click(left("Two"));
    fireEvent.click(rightButtons().find((button) => button.textContent === "Second")!);
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Mark as complete" }),
    );

    expect(onFinish).toHaveBeenLastCalledWith(expect.objectContaining({
      variant: "match",
      attempts: 3,
      choices: [
        { left: 0, right: 1 },
        { left: 0, right: 0 },
        { left: 1, right: 1 },
      ],
      hintsUsed: 0,
      submission: "retry",
      playthrough: 1,
    }));
    expect(onComplete).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("provides a grounded hint and correction while keeping matching available", () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const view = render(
      <I18nProvider locale="en" messages={en}>
        <MatchGame
          completed={false}
          onComplete={vi.fn()}
          onFinish={onFinish}
          pairs={[
            { left: "One", right: "First" },
            { left: "Two", right: "Second" },
          ]}
        />
      </I18nProvider>,
    );

    fireEvent.click(
      within(view.container).getByRole("button", { name: "Hint" }),
    );
    expect(view.getByText("Hint: One → First")).toBeTruthy();
    const left = within(view.container).getByRole("button", { name: "One" });
    const second = within(view.container).getByRole("button", { name: "Second" });
    fireEvent.click(left);
    fireEvent.click(second);
    expect(view.getByText("Correction: One → First")).toBeTruthy();
    vi.advanceTimersByTime(600);
    expect(onFinish).toHaveBeenLastCalledWith(expect.objectContaining({
      variant: "match",
      attempts: 1,
      choices: [{ left: 0, right: 1 }],
      hintsUsed: 1,
      submission: "first",
      playthrough: 1,
    }));
    vi.useRealTimers();
  });
});
