// @vitest-environment jsdom

import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/en.json";
import { I18nProvider } from "@/i18n/client";
import { BlockForm } from "@/components/teach/editor/block-form";
import { ChooseGame } from "./ChooseGame";

describe("ChooseGame learner behavior", () => {
  it("allows incorrect continuation and completes through the accessible buttons", () => {
    const onComplete = vi.fn();
    const onFinish = vi.fn();
    const view = render(
      <I18nProvider locale="en" messages={en}>
        <ChooseGame
          completed={false}
          onComplete={onComplete}
          onFinish={onFinish}
          options={[
            { text: "Distractor", correct: false },
            { text: "Correct", correct: true },
          ]}
          prompt="Pick one"
        />
      </I18nProvider>,
    );

    const options = () =>
      within(view.container).getAllByRole("button", {
        name: /Distractor|Correct/,
      });
    fireEvent.click(options()[0]);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(options()[1]);
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Mark as complete" }),
    );

    expect(onFinish).toHaveBeenNthCalledWith(1, expect.objectContaining({
      variant: "choose",
      attempts: 1,
      option: 0,
      hintsUsed: 0,
      submission: "first",
      playthrough: 1,
    }));
    expect(onFinish).toHaveBeenNthCalledWith(2, expect.objectContaining({
      variant: "choose",
      attempts: 2,
      option: 1,
      hintsUsed: 0,
      submission: "retry",
      playthrough: 1,
    }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("shows a correction and records a hint without penalizing the retry", () => {
    const onFinish = vi.fn();
    const view = render(
      <I18nProvider locale="en" messages={en}>
        <ChooseGame
          completed={false}
          onComplete={vi.fn()}
          onFinish={onFinish}
          options={[
            { text: "Distractor", correct: false },
            { text: "Correct", correct: true },
          ]}
          prompt="Pick one"
        />
      </I18nProvider>,
    );

    fireEvent.click(
      within(view.container).getByRole("button", { name: "Hint" }),
    );
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Distractor" }),
    );

    expect(view.getByText("Correction: Correct")).toBeTruthy();
    fireEvent.click(
      within(view.container).getByRole("button", { name: "Correct" }),
    );
    expect(onFinish).toHaveBeenLastCalledWith(expect.objectContaining({
      variant: "choose",
      attempts: 2,
      option: 1,
      hintsUsed: 1,
      submission: "retry",
      playthrough: 1,
    }));
  });

  it("lets instructors edit the prompt and choose exactly one correct option", () => {
    const onChange = vi.fn();
    const block = {
      id: "game",
      title: "Choose",
      type: "game" as const,
      payload: {
        variant: "choose" as const,
        prompt: "Pick one",
        options: [
          { text: "A", correct: true },
          { text: "B", correct: false },
        ],
      },
    };
    const view = render(
      <I18nProvider locale="en" messages={en}>
        <BlockForm block={block} onChange={onChange} onProblem={vi.fn()} />
      </I18nProvider>,
    );

    fireEvent.click(view.getAllByRole("radio")[1]);
    expect(onChange).toHaveBeenCalledWith({
      ...block,
      payload: {
        ...block.payload,
        options: [
          { text: "A", correct: false },
          { text: "B", correct: true },
        ],
      },
    });
  });
});
