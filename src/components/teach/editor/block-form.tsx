"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { MarkdownView } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  Block,
  BlockOfType,
  BlockType,
  QuizQuestion,
  QuestionKind,
  SimulationBlock,
} from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

/**
 * Per-type editing forms for the course editor (P5.1).
 *
 * Every form edits a block of exactly one type and hands a full `Block` back
 * to the editor. Fields are allowed to hold values that violate the block
 * schema (an empty option, zero questions after a delete) — validation runs on
 * the whole course when the author saves, which is what produces the specific
 * "payload.questions.0.options.1" message instead of a silent coercion.
 *
 * Only the simulation is different: its payload is edited as raw JSON, because
 * a nested node/option form would be larger than the block itself. A JSON
 * syntax error is reported upwards through `onProblem` so the save button can
 * refuse a textarea whose content was never applied.
 */

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const SMALL_SELECT_CLASS =
  "h-7 rounded-lg border border-input bg-transparent px-1.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const MONO_CLASS = "font-mono text-xs";

type FormProps<T extends BlockType> = {
  block: BlockOfType<T>;
  onChange: (next: Block) => void;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        {hint === undefined ? null : (
          <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      aria-label={label}
      disabled={disabled === true}
      onClick={onClick}
      size="icon-xs"
      title={label}
      variant="ghost"
    >
      {children}
    </Button>
  );
}

/** Small "add" row used by the list-backed forms. */
function AddRow({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      disabled={disabled === true}
      onClick={onClick}
      size="sm"
      variant="outline"
    >
      <Plus aria-hidden="true" />
      {label}
    </Button>
  );
}

/** Dispatches to the form that matches the block type. */
export function BlockForm({
  block,
  onChange,
  onProblem,
}: {
  block: Block;
  onChange: (next: Block) => void;
  onProblem: (message: string | null) => void;
}) {
  switch (block.type) {
    case "reading":
      return <ReadingForm block={block} onChange={onChange} />;
    case "quiz":
      return <QuizForm block={block} onChange={onChange} />;
    case "flashcards":
      return <FlashcardsForm block={block} onChange={onChange} />;
    case "slides":
      return <SlidesForm block={block} onChange={onChange} />;
    case "coding":
      return <CodingForm block={block} onChange={onChange} />;
    case "game":
      return <GameForm block={block} onChange={onChange} />;
    case "simulation":
      return (
        <SimulationForm
          block={block}
          onChange={onChange}
          onProblem={onProblem}
        />
      );
    case "roleplay":
      return <RoleplayForm block={block} onChange={onChange} />;
    case "reflection":
      return <ReflectionForm block={block} onChange={onChange} />;
  }
}

function ReadingForm({ block, onChange }: FormProps<"reading">) {
  const [view, setView] = useState<"write" | "preview">("write");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Button
          onClick={() => {
            setView("write");
          }}
          size="xs"
          variant={view === "write" ? "secondary" : "ghost"}
        >
          Write
        </Button>
        <Button
          onClick={() => {
            setView("preview");
          }}
          size="xs"
          variant={view === "preview" ? "secondary" : "ghost"}
        >
          Preview
        </Button>
      </div>

      {view === "write" ? (
        <Textarea
          className={cn("min-h-80", MONO_CLASS)}
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, markdown: event.target.value },
            });
          }}
          placeholder="## A heading&#10;&#10;Paragraph text with **markdown**."
          rows={16}
          spellCheck={false}
          value={block.payload.markdown}
        />
      ) : (
        <div className="min-h-80 rounded-lg border bg-muted/30 p-3">
          {block.payload.markdown.trim().length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing to preview yet.</p>
          ) : (
            <MarkdownView>{block.payload.markdown}</MarkdownView>
          )}
        </div>
      )}

      <Field hint="Optional" label="Image URL">
        <Input
          onChange={(event) => {
            const value = event.target.value;
            onChange({
              ...block,
              payload: {
                ...block.payload,
                imageUrl: value.trim().length === 0 ? undefined : value,
              },
            });
          }}
          placeholder="/images/lesson.png or https://…"
          value={block.payload.imageUrl ?? ""}
        />
      </Field>
    </div>
  );
}

type ChoiceQuestion = Extract<QuizQuestion, { kind: "single" | "multi" }>;

const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  single: "Single choice",
  multi: "Multiple choice",
  truefalse: "True / false",
  short: "Short answer",
};

/** Rewrites a question into another kind, keeping what still applies. */
function convertQuestion(
  question: QuizQuestion,
  kind: QuestionKind,
): QuizQuestion {
  const base = {
    id: question.id,
    prompt: question.prompt,
    explanation: question.explanation,
  };

  if (kind === question.kind) {
    return question;
  }

  const options =
    question.kind === "single"
    || question.kind === "multi"
    || question.kind === "truefalse"
      ? question.options
      : undefined;

  switch (kind) {
    case "single":
      return {
        ...base,
        kind,
        options: options ?? ["Option 1", "Option 2"],
        answer: [0],
      };
    case "multi":
      return {
        ...base,
        kind,
        options: options ?? ["Option 1", "Option 2"],
        answer: [0],
      };
    case "truefalse":
      return { ...base, kind, answer: [0] };
    case "short":
      return { ...base, kind, answer: "" };
  }
}

function newQuestion(kind: QuestionKind): QuizQuestion {
  return convertQuestion(
    {
      id: crypto.randomUUID(),
      kind: "single",
      prompt: "",
      explanation: "",
      options: ["", ""],
      answer: [0],
    },
    kind,
  );
}

/** Removes one option and shifts the answer indices that followed it. */
function removeChoiceOption(question: ChoiceQuestion, index: number): ChoiceQuestion {
  const options = question.options.filter((_, position) => position !== index);
  const answer = question.answer
    .filter((selected) => selected !== index)
    .map((selected) => (selected > index ? selected - 1 : selected));

  if (question.kind === "single") {
    return { ...question, options, answer };
  }

  return { ...question, options, answer };
}

function ChoiceOptions({
  question,
  onChange,
}: {
  question: ChoiceQuestion;
  onChange: (next: QuizQuestion) => void;
}) {
  const emit = (options: string[], answer: number[]): void => {
    if (question.kind === "single") {
      onChange({ ...question, options, answer });
    } else {
      onChange({ ...question, options, answer });
    }
  };

  return (
    <div className="space-y-1.5">
      {question.options.map((option, index) => (
        <div className="flex items-center gap-1.5" key={`option-${String(index)}`}>
          <input
            aria-label={`Mark option ${String(index + 1)} as correct`}
            checked={question.answer.includes(index)}
            className="size-3.5 shrink-0 accent-primary"
            onChange={() => {
              if (question.kind === "single") {
                emit(question.options, [index]);
                return;
              }

              const answer = question.answer.includes(index)
                ? question.answer.filter((selected) => selected !== index)
                : [...question.answer, index].sort((left, right) => left - right);
              emit(question.options, answer);
            }}
            type={question.kind === "single" ? "radio" : "checkbox"}
          />
          <Input
            aria-label={`Option ${String(index + 1)}`}
            onChange={(event) => {
              const options = question.options.map((entry, position) =>
                position === index ? event.target.value : entry,
              );
              emit(options, question.answer);
            }}
            placeholder={`Option ${String(index + 1)}`}
            value={option}
          />
          <IconButton
            disabled={question.options.length <= 2}
            label="Remove option"
            onClick={() => {
              onChange(removeChoiceOption(question, index));
            }}
          >
            <Trash2 aria-hidden="true" />
          </IconButton>
        </div>
      ))}

      <Button
        onClick={() => {
          emit([...question.options, ""], question.answer);
        }}
        size="xs"
        variant="ghost"
      >
        <Plus aria-hidden="true" />
        Add option
      </Button>
    </div>
  );
}

function QuizForm({ block, onChange }: FormProps<"quiz">) {
  const questions = block.payload.questions;

  function replaceQuestion(index: number, next: QuizQuestion): void {
    onChange({
      ...block,
      payload: {
        ...block.payload,
        questions: questions.map((question, position) =>
          position === index ? next : question,
        ),
      },
    });
  }

  return (
    <div className="space-y-3">
      <Field hint="0–100%" label="Pass score">
        <Input
          max={100}
          min={0}
          onChange={(event) => {
            const percent = Number(event.target.value);
            onChange({
              ...block,
              payload: {
                ...block.payload,
                passScore: Number.isFinite(percent) ? percent / 100 : 0,
              },
            });
          }}
          step={5}
          type="number"
          value={Math.round(block.payload.passScore * 100)}
        />
      </Field>

      {questions.map((question, index) => (
        <div
          className="space-y-2 rounded-lg border p-2.5"
          key={question.id}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Question {index + 1}</p>
            <div className="flex items-center gap-1">
              <select
                aria-label={`Kind of question ${String(index + 1)}`}
                className={SMALL_SELECT_CLASS}
                onChange={(event) => {
                  replaceQuestion(
                    index,
                    convertQuestion(question, event.target.value as QuestionKind),
                  );
                }}
                value={question.kind}
              >
                {Object.entries(QUESTION_KIND_LABELS).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
              <IconButton
                disabled={questions.length <= 1}
                label="Remove question"
                onClick={() => {
                  onChange({
                    ...block,
                    payload: {
                      ...block.payload,
                      questions: questions.filter(
                        (_, position) => position !== index,
                      ),
                    },
                  });
                }}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </div>
          </div>

          <Textarea
            aria-label={`Prompt of question ${String(index + 1)}`}
            onChange={(event) => {
              replaceQuestion(index, { ...question, prompt: event.target.value });
            }}
            placeholder="Question prompt"
            rows={2}
            value={question.prompt}
          />

          {question.kind === "single" || question.kind === "multi" ? (
            <ChoiceOptions
              onChange={(next) => {
                replaceQuestion(index, next);
              }}
              question={question}
            />
          ) : null}

          {question.kind === "truefalse" ? (
            <div className="flex flex-wrap gap-3 text-xs">
              {["True", "False"].map((label, value) => (
                <label className="flex items-center gap-1.5" key={label}>
                  <input
                    checked={question.answer[0] === value}
                    className="size-3.5 accent-primary"
                    onChange={() => {
                      replaceQuestion(index, { ...question, answer: [value] });
                    }}
                    type="radio"
                  />
                  {label}
                </label>
              ))}
            </div>
          ) : null}

          {question.kind === "short" ? (
            <Input
              aria-label={`Keywords of question ${String(index + 1)}`}
              onChange={(event) => {
                replaceQuestion(index, { ...question, answer: event.target.value });
              }}
              placeholder="Keywords, separated by commas"
              value={question.answer}
            />
          ) : null}

          <Input
            aria-label={`Explanation of question ${String(index + 1)}`}
            onChange={(event) => {
              replaceQuestion(index, {
                ...question,
                explanation: event.target.value,
              });
            }}
            placeholder="Explanation shown after answering"
            value={question.explanation}
          />
        </div>
      ))}

      <AddRow
        label="Add question"
        onClick={() => {
          onChange({
            ...block,
            payload: {
              ...block.payload,
              questions: [...questions, newQuestion("single")],
            },
          });
        }}
      />
    </div>
  );
}

function FlashcardsForm({ block, onChange }: FormProps<"flashcards">) {
  const cards = block.payload.cards;

  function replaceCard(index: number, next: { front: string; back: string }): void {
    onChange({
      ...block,
      payload: {
        ...block.payload,
        cards: cards.map((card, position) => (position === index ? next : card)),
      },
    });
  }

  return (
    <div className="space-y-2">
      {cards.map((card, index) => (
        <div className="flex items-start gap-1.5" key={`card-${String(index)}`}>
          <div className="grid flex-1 gap-1.5">
            <Input
              aria-label={`Front of card ${String(index + 1)}`}
              onChange={(event) => {
                replaceCard(index, { ...card, front: event.target.value });
              }}
              placeholder="Front (term)"
              value={card.front}
            />
            <Input
              aria-label={`Back of card ${String(index + 1)}`}
              onChange={(event) => {
                replaceCard(index, { ...card, back: event.target.value });
              }}
              placeholder="Back (definition)"
              value={card.back}
            />
          </div>
          <IconButton
            disabled={cards.length <= 1}
            label="Remove card"
            onClick={() => {
              onChange({
                ...block,
                payload: {
                  ...block.payload,
                  cards: cards.filter((_, position) => position !== index),
                },
              });
            }}
          >
            <Trash2 aria-hidden="true" />
          </IconButton>
        </div>
      ))}

      <AddRow
        label="Add card"
        onClick={() => {
          onChange({
            ...block,
            payload: {
              ...block.payload,
              cards: [...cards, { front: "", back: "" }],
            },
          });
        }}
      />
    </div>
  );
}

function SlidesForm({ block, onChange }: FormProps<"slides">) {
  const slides = block.payload.slides;

  function replaceSlide(
    index: number,
    next: { title: string; bullets: string[]; narration: string },
  ): void {
    onChange({
      ...block,
      payload: {
        ...block.payload,
        slides: slides.map((slide, position) =>
          position === index ? next : slide,
        ),
      },
    });
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs">
        <input
          checked={block.payload.autoPlay}
          className="size-3.5 accent-primary"
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, autoPlay: event.target.checked },
            });
          }}
          type="checkbox"
        />
        Start narration automatically when a slide opens
      </label>

      {slides.map((slide, index) => (
        <div className="space-y-2 rounded-lg border p-2.5" key={`slide-${String(index)}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Slide {index + 1}</p>
            <IconButton
              disabled={slides.length <= 1}
              label="Remove slide"
              onClick={() => {
                onChange({
                  ...block,
                  payload: {
                    ...block.payload,
                    slides: slides.filter((_, position) => position !== index),
                  },
                });
              }}
            >
              <Trash2 aria-hidden="true" />
            </IconButton>
          </div>

          <Input
            aria-label={`Title of slide ${String(index + 1)}`}
            onChange={(event) => {
              replaceSlide(index, { ...slide, title: event.target.value });
            }}
            placeholder="Slide title"
            value={slide.title}
          />

          <Field hint="One per line" label="Bullets">
            <Textarea
              onChange={(event) => {
                replaceSlide(index, {
                  ...slide,
                  bullets: event.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0),
                });
              }}
              placeholder={"First point\nSecond point"}
              rows={3}
              value={slide.bullets.join("\n")}
            />
          </Field>

          <Field hint="Read out loud" label="Narration">
            <Textarea
              onChange={(event) => {
                replaceSlide(index, { ...slide, narration: event.target.value });
              }}
              placeholder="What the narrator says while this slide is open."
              rows={3}
              value={slide.narration}
            />
          </Field>
        </div>
      ))}

      <AddRow
        label="Add slide"
        onClick={() => {
          onChange({
            ...block,
            payload: {
              ...block.payload,
              slides: [
                ...slides,
                { title: "", bullets: [], narration: "" },
              ],
            },
          });
        }}
      />
    </div>
  );
}

function CodingForm({ block, onChange }: FormProps<"coding">) {
  const { problem, starter, tests, hints } = block.payload;

  return (
    <div className="space-y-3">
      <Field label="Problem">
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, problem: event.target.value },
            });
          }}
          placeholder="Describe the exercise and what the function must do."
          rows={4}
          value={problem}
        />
      </Field>

      <Field hint="JavaScript" label="Starter code">
        <Textarea
          className={cn("min-h-40", MONO_CLASS)}
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, starter: event.target.value },
            });
          }}
          rows={8}
          spellCheck={false}
          value={starter}
        />
      </Field>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Tests</p>
        {tests.map((test, index) => (
          <div className="flex items-start gap-1.5" key={`test-${String(index)}`}>
            <Input
              aria-label={`Name of test ${String(index + 1)}`}
              className="w-2/5"
              onChange={(event) => {
                onChange({
                  ...block,
                  payload: {
                    ...block.payload,
                    tests: tests.map((entry, position) =>
                      position === index
                        ? { ...entry, name: event.target.value }
                        : entry,
                    ),
                  },
                });
              }}
              placeholder="Name"
              value={test.name}
            />
            <Input
              aria-label={`Expression of test ${String(index + 1)}`}
              className={MONO_CLASS}
              onChange={(event) => {
                onChange({
                  ...block,
                  payload: {
                    ...block.payload,
                    tests: tests.map((entry, position) =>
                      position === index
                        ? { ...entry, expression: event.target.value }
                        : entry,
                    ),
                  },
                });
              }}
              placeholder="solve(2) === 4"
              value={test.expression}
            />
            <IconButton
              disabled={tests.length <= 1}
              label="Remove test"
              onClick={() => {
                onChange({
                  ...block,
                  payload: {
                    ...block.payload,
                    tests: tests.filter((_, position) => position !== index),
                  },
                });
              }}
            >
              <Trash2 aria-hidden="true" />
            </IconButton>
          </div>
        ))}
        <AddRow
          label="Add test"
          onClick={() => {
            onChange({
              ...block,
              payload: {
                ...block.payload,
                tests: [...tests, { name: "", expression: "" }],
              },
            });
          }}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Hints</p>
        {hints.map((hint, index) => (
          <div className="flex items-center gap-1.5" key={`hint-${String(index)}`}>
            <Input
              aria-label={`Hint ${String(index + 1)}`}
              onChange={(event) => {
                onChange({
                  ...block,
                  payload: {
                    ...block.payload,
                    hints: hints.map((entry, position) =>
                      position === index ? event.target.value : entry,
                    ),
                  },
                });
              }}
              placeholder="A nudge in the right direction"
              value={hint}
            />
            <IconButton
              label="Remove hint"
              onClick={() => {
                onChange({
                  ...block,
                  payload: {
                    ...block.payload,
                    hints: hints.filter((_, position) => position !== index),
                  },
                });
              }}
            >
              <Trash2 aria-hidden="true" />
            </IconButton>
          </div>
        ))}
        <AddRow
          label="Add hint"
          onClick={() => {
            onChange({
              ...block,
              payload: { ...block.payload, hints: [...hints, ""] },
            });
          }}
        />
      </div>
    </div>
  );
}

function GameForm({ block, onChange }: FormProps<"game">) {
  const payload = block.payload;

  function switchVariant(variant: "sort" | "match"): void {
    if (payload.variant === variant) {
      return;
    }

    if (variant === "sort") {
      onChange({
        ...block,
        payload: {
          variant: "sort",
          items:
            payload.variant === "match"
              ? payload.pairs.map((pair, index) => ({
                  text: pair.left,
                  order: index,
                }))
              : payload.items,
        },
      });
      return;
    }

    onChange({
      ...block,
      payload: {
        variant: "match",
        pairs:
          payload.variant === "sort"
            ? payload.items.map((item) => ({ left: item.text, right: "" }))
            : payload.pairs,
      },
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Variant">
        <select
          className={SELECT_CLASS}
          onChange={(event) => {
            switchVariant(event.target.value === "match" ? "match" : "sort");
          }}
          value={payload.variant}
        >
          <option value="sort">Order the steps</option>
          <option value="match">Match the pairs</option>
        </select>
      </Field>

      {payload.variant === "sort" ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Items</p>
          {payload.items.map((item, index) => (
            <div className="flex items-center gap-1.5" key={`item-${String(index)}`}>
              <Input
                aria-label={`Text of item ${String(index + 1)}`}
                onChange={(event) => {
                  onChange({
                    ...block,
                    payload: {
                      variant: "sort",
                      items: payload.items.map((entry, position) =>
                        position === index
                          ? { ...entry, text: event.target.value }
                          : entry,
                      ),
                    },
                  });
                }}
                placeholder="Step text"
                value={item.text}
              />
              <Input
                aria-label={`Order of item ${String(index + 1)}`}
                className="w-20"
                onChange={(event) => {
                  const order = Number(event.target.value);
                  onChange({
                    ...block,
                    payload: {
                      variant: "sort",
                      items: payload.items.map((entry, position) =>
                        position === index
                          ? { ...entry, order: Number.isFinite(order) ? order : 0 }
                          : entry,
                      ),
                    },
                  });
                }}
                type="number"
                value={item.order}
              />
              <IconButton
                disabled={payload.items.length <= 2}
                label="Remove item"
                onClick={() => {
                  onChange({
                    ...block,
                    payload: {
                      variant: "sort",
                      items: payload.items.filter(
                        (_, position) => position !== index,
                      ),
                    },
                  });
                }}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Order values must be different from each other; only the relative
            order is used.
          </p>
          <AddRow
            label="Add item"
            onClick={() => {
              onChange({
                ...block,
                payload: {
                  variant: "sort",
                  items: [
                    ...payload.items,
                    { text: "", order: payload.items.length },
                  ],
                },
              });
            }}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Pairs</p>
          {payload.pairs.map((pair, index) => (
            <div className="flex items-center gap-1.5" key={`pair-${String(index)}`}>
              <Input
                aria-label={`Left of pair ${String(index + 1)}`}
                onChange={(event) => {
                  onChange({
                    ...block,
                    payload: {
                      variant: "match",
                      pairs: payload.pairs.map((entry, position) =>
                        position === index
                          ? { ...entry, left: event.target.value }
                          : entry,
                      ),
                    },
                  });
                }}
                placeholder="Left"
                value={pair.left}
              />
              <Input
                aria-label={`Right of pair ${String(index + 1)}`}
                onChange={(event) => {
                  onChange({
                    ...block,
                    payload: {
                      variant: "match",
                      pairs: payload.pairs.map((entry, position) =>
                        position === index
                          ? { ...entry, right: event.target.value }
                          : entry,
                      ),
                    },
                  });
                }}
                placeholder="Right"
                value={pair.right}
              />
              <IconButton
                disabled={payload.pairs.length <= 2}
                label="Remove pair"
                onClick={() => {
                  onChange({
                    ...block,
                    payload: {
                      variant: "match",
                      pairs: payload.pairs.filter(
                        (_, position) => position !== index,
                      ),
                    },
                  });
                }}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </div>
          ))}
          <AddRow
            label="Add pair"
            onClick={() => {
              onChange({
                ...block,
                payload: {
                  variant: "match",
                  pairs: [...payload.pairs, { left: "", right: "" }],
                },
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

function SimulationForm({
  block,
  onChange,
  onProblem,
}: FormProps<"simulation"> & { onProblem: (message: string | null) => void }) {
  const [text, setText] = useState(() =>
    JSON.stringify(block.payload, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  function apply(value: string): void {
    setText(value);

    try {
      const parsed: unknown = JSON.parse(value);
      setError(null);
      onProblem(null);
      onChange({
        ...block,
        payload: parsed as SimulationBlock["payload"],
      });
    } catch (cause: unknown) {
      const reason = cause instanceof Error ? cause.message : "unknown error";
      setError(`Not valid JSON — ${reason}`);
      onProblem(`The simulation JSON is not valid JSON (${reason}).`);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Edited as JSON: <code>intro</code>, <code>start</code>, <code>end</code>{" "}
        and a <code>nodes</code> map. Every node except <code>end</code> needs at
        least one option, and each option&apos;s <code>next</code> must be a node
        key.
      </p>

      <Textarea
        aria-label="Simulation JSON"
        className={cn("min-h-96", MONO_CLASS)}
        onChange={(event) => {
          apply(event.target.value);
        }}
        rows={20}
        spellCheck={false}
        value={text}
      />

      {error === null ? null : (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}

      <Button
        onClick={() => {
          try {
            setText(JSON.stringify(JSON.parse(text), null, 2));
            setError(null);
            onProblem(null);
          } catch {
            // The error is already shown above; formatting changes nothing.
          }
        }}
        size="xs"
        variant="outline"
      >
        Format JSON
      </Button>
    </div>
  );
}

function RoleplayForm({ block, onChange }: FormProps<"roleplay">) {
  const { scenario, persona, goal, rubric } = block.payload;

  return (
    <div className="space-y-3">
      <Field label="Scenario">
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, scenario: event.target.value },
            });
          }}
          placeholder="Set the room: where is the learner, and what is happening?"
          rows={3}
          value={scenario}
        />
      </Field>

      <Field label="Persona">
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, persona: event.target.value },
            });
          }}
          placeholder="Who is the AI playing? Give it a role, a tone and an agenda."
          rows={3}
          value={persona}
        />
      </Field>

      <Field label="Goal">
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, goal: event.target.value },
            });
          }}
          placeholder="What should the learner achieve in the conversation?"
          rows={2}
          value={goal}
        />
      </Field>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Rubric</p>
        {rubric.map((criterion, index) => (
          <div className="flex items-center gap-1.5" key={`criterion-${String(index)}`}>
            <Input
              aria-label={`Rubric criterion ${String(index + 1)}`}
              onChange={(event) => {
                onChange({
                  ...block,
                  payload: {
                    ...block.payload,
                    rubric: rubric.map((entry, position) =>
                      position === index ? event.target.value : entry,
                    ),
                  },
                });
              }}
              placeholder="A criterion the feedback report scores"
              value={criterion}
            />
            <IconButton
              disabled={rubric.length <= 1}
              label="Remove criterion"
              onClick={() => {
                onChange({
                  ...block,
                  payload: {
                    ...block.payload,
                    rubric: rubric.filter((_, position) => position !== index),
                  },
                });
              }}
            >
              <Trash2 aria-hidden="true" />
            </IconButton>
          </div>
        ))}
        <AddRow
          label="Add criterion"
          onClick={() => {
            onChange({
              ...block,
              payload: { ...block.payload, rubric: [...rubric, ""] },
            });
          }}
        />
      </div>
    </div>
  );
}

function ReflectionForm({ block, onChange }: FormProps<"reflection">) {
  return (
    <div className="space-y-3">
      <Field label="Prompt">
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, prompt: event.target.value },
            });
          }}
          placeholder="What should the learner reflect on?"
          rows={4}
          value={block.payload.prompt}
        />
      </Field>

      <Field hint="Words" label="Minimum length">
        <Input
          min={1}
          onChange={(event) => {
            const words = Number(event.target.value);
            onChange({
              ...block,
              payload: {
                ...block.payload,
                minWords: Number.isFinite(words) ? Math.trunc(words) : 1,
              },
            });
          }}
          type="number"
          value={block.payload.minWords}
        />
      </Field>
    </div>
  );
}
