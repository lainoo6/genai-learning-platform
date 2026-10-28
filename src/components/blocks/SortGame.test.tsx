// @vitest-environment jsdom

import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/en.json";
import { I18nProvider } from "@/i18n/client";
import { BlockForm } from "@/components/teach/editor/block-form";
import { SortGame } from "./SortGame";

describe("SortGame learner behavior", () => {
  it("moves the focused row with Arrow Up and reports completion only after checking", () => {
    const onComplete = vi.fn();
    const onFinish = vi.fn();
    const view = render(
      <I18nProvider locale="en" messages={en}>
        <SortGame
          completed={false}
          items={[
            { text: "First", order: 0 },
            { text: "Second", order: 1 },
            { text: "Third", order: 2 },
          ]}
          onComplete={onComplete}
          onFinish={onFinish}
        />
      </I18nProvider>,
    );

    const rows = () => [...view.container.querySelectorAll("ol button")];
    expect(rows().map((row) => row.textContent?.trim())).toEqual([
      "1Second",
      "2Third",
      "3First",
    ]);

    fireEvent.keyDown(rows()[2], { key: "ArrowUp" });
    expect(rows().map((row) => row.textContent?.trim())).toEqual([
      "1Second",
      "2First",
      "3Third",
    ]);
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(
      within(view.container).getByRole("button", { name: "Check order" }),
    );
    expect(onFinish).toHaveBeenCalledWith({
      variant: "sort",
      attempts: 1,
      order: [1, 0, 2],
      hintsUsed: 0,
      submission: "first",
      playthrough: 1,
    });
  });

  it("completes after the learner sorts every row and confirms it", () => {
    const onComplete = vi.fn();
    const view = render(
      <I18nProvider locale="en" messages={en}>
        <SortGame
          completed={false}
          items={[
            { text: "First", order: 0 },
            { text: "Second", order: 1 },
            { text: "Third", order: 2 },
          ]}
          onComplete={onComplete}
          onFinish={vi.fn()}
        />
      </I18nProvider>,
    );
    const rows = () => [...view.container.querySelectorAll("ol button")];

    fireEvent.keyDown(rows()[2], { key: "ArrowUp" });
    fireEvent.keyDown(rows()[1], { key: "ArrowUp" });
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Check order" }),
    );
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Mark as complete" }),
    );

    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("updates the editor payload when an item is moved", () => {
    const onChange = vi.fn();
    const block = {
      id: "game",
      title: "Sort",
      type: "game" as const,
      payload: {
        variant: "sort" as const,
        items: [
          { text: "First", order: 0 },
          { text: "Second", order: 1 },
        ],
      },
    };
    const view = render(
      <I18nProvider locale="en" messages={en}>
        <BlockForm
          block={block}
          onChange={onChange}
          onProblem={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(view.getAllByLabelText("Move up")[1]);

    expect(onChange).toHaveBeenCalledWith({
      ...block,
      payload: {
        variant: "sort",
        items: [
          { text: "Second", order: 0 },
          { text: "First", order: 1 },
        ],
      },
    });
  });

  it("shows a correction and records hint use in a retry", () => {
    const onFinish = vi.fn();
    const view = render(
      <I18nProvider locale="en" messages={en}>
        <SortGame
          completed={false}
          items={[
            { text: "First", order: 0 },
            { text: "Second", order: 1 },
          ]}
          onComplete={vi.fn()}
          onFinish={onFinish}
        />
      </I18nProvider>,
    );
    const rows = () => [...view.container.querySelectorAll("ol button")];
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Hint" }),
    );
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Check order" }),
    );
    expect(view.getByText("Correction: First, Second")).toBeTruthy();
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Replay" }),
    );
    fireEvent.keyDown(rows()[1], { key: "ArrowUp" });
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Check order" }),
    );
    expect(onFinish).toHaveBeenLastCalledWith({
      variant: "sort",
      attempts: 1,
      order: [0, 1],
      hintsUsed: 0,
      submission: "first",
      playthrough: 2,
    });
  });
});
