"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { MarkdownView } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import type { Translator } from "@/i18n/translate";
import type {
  Block,
  BlockOfType,
  BlockType,
  QuizQuestion,
  QuestionKind,
} from "@/lib/blocks/schema";
import { simulationBlockSchema } from "@/lib/blocks/schema";
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
 * Simulation nodes and sort positions use forms; the shared schema validates
 * references and score values again on the server before saving.
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
          <span className="text-[11px] font-normal text-muted-foreground">
            {hint}
          </span>
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
      return <SimulationForm block={block} onChange={onChange} />;
    case "roleplay":
      return <RoleplayForm block={block} onChange={onChange} />;
    case "reflection":
      return <ReflectionForm block={block} onChange={onChange} />;
  }
}

function ReadingForm({ block, onChange }: FormProps<"reading">) {
  const t = useT();
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
          {t("editor.form.write")}
        </Button>
        <Button
          onClick={() => {
            setView("preview");
          }}
          size="xs"
          variant={view === "preview" ? "secondary" : "ghost"}
        >
          {t("editor.form.preview")}
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
          placeholder={t("editor.form.markdownPlaceholder")}
          rows={16}
          spellCheck={false}
          value={block.payload.markdown}
        />
      ) : (
        <div className="min-h-80 rounded-lg border bg-muted/30 p-3">
          {block.payload.markdown.trim().length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("editor.form.nothingToPreview")}
            </p>
          ) : (
            <MarkdownView>{block.payload.markdown}</MarkdownView>
          )}
        </div>
      )}

      <Field hint={t("editor.form.optional")} label={t("editor.form.imageUrl")}>
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
          placeholder={t("editor.form.imageUrlPlaceholder")}
          value={block.payload.imageUrl ?? ""}
        />
      </Field>
    </div>
  );
}

type ChoiceQuestion = Extract<QuizQuestion, { kind: "single" | "multi" }>;

const QUESTION_KIND_KEYS: Record<QuestionKind, string> = {
  single: "editor.question.single",
  multi: "editor.question.multi",
  truefalse: "editor.question.truefalse",
  short: "editor.question.short",
};

/** Rewrites a question into another kind, keeping what still applies. */
function convertQuestion(
  question: QuizQuestion,
  kind: QuestionKind,
  t: Translator,
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
    question.kind === "single" ||
    question.kind === "multi" ||
    question.kind === "truefalse"
      ? question.options
      : undefined;

  switch (kind) {
    case "single":
      return {
        ...base,
        kind,
        options: options ?? [
          t("editor.option.label", { index: 1 }),
          t("editor.option.label", { index: 2 }),
        ],
        answer: [0],
      };
    case "multi":
      return {
        ...base,
        kind,
        options: options ?? [
          t("editor.option.label", { index: 1 }),
          t("editor.option.label", { index: 2 }),
        ],
        answer: [0],
      };
    case "truefalse":
      return { ...base, kind, answer: [0] };
    case "short":
      return { ...base, kind, answer: "" };
  }
}

function newQuestion(kind: QuestionKind, t: Translator): QuizQuestion {
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
    t,
  );
}

/** Removes one option and shifts the answer indices that followed it. */
function removeChoiceOption(
  question: ChoiceQuestion,
  index: number,
): ChoiceQuestion {
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
  const t = useT();
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
        <div
          className="flex items-center gap-1.5"
          key={`option-${String(index)}`}
        >
          <input
            aria-label={t("editor.option.markCorrect", { index: index + 1 })}
            checked={question.answer.includes(index)}
            className="size-3.5 shrink-0 accent-primary"
            onChange={() => {
              if (question.kind === "single") {
                emit(question.options, [index]);
                return;
              }

              const answer = question.answer.includes(index)
                ? question.answer.filter((selected) => selected !== index)
                : [...question.answer, index].sort(
                    (left, right) => left - right,
                  );
              emit(question.options, answer);
            }}
            type={question.kind === "single" ? "radio" : "checkbox"}
          />
          <Input
            aria-label={t("editor.option.label", { index: index + 1 })}
            onChange={(event) => {
              const options = question.options.map((entry, position) =>
                position === index ? event.target.value : entry,
              );
              emit(options, question.answer);
            }}
            placeholder={t("editor.option.label", { index: index + 1 })}
            value={option}
          />
          <IconButton
            disabled={question.options.length <= 2}
            label={t("editor.option.remove")}
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
        {t("editor.option.add")}
      </Button>
    </div>
  );
}

function QuizForm({ block, onChange }: FormProps<"quiz">) {
  const t = useT();
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
      <Field hint="0–100%" label={t("editor.quiz.passScore")}>
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
        <div className="space-y-2 rounded-lg border p-2.5" key={question.id}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">
              {t("editor.question.number", { index: index + 1 })}
            </p>
            <div className="flex items-center gap-1">
              <select
                aria-label={t("editor.question.kindAria", { index: index + 1 })}
                className={SMALL_SELECT_CLASS}
                onChange={(event) => {
                  replaceQuestion(
                    index,
                    convertQuestion(
                      question,
                      event.target.value as QuestionKind,
                      t,
                    ),
                  );
                }}
                value={question.kind}
              >
                {Object.entries(QUESTION_KIND_KEYS).map(([kind, key]) => (
                  <option key={kind} value={kind}>
                    {t(key)}
                  </option>
                ))}
              </select>
              <IconButton
                disabled={questions.length <= 1}
                label={t("editor.question.remove")}
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
            aria-label={t("editor.question.promptAria", { index: index + 1 })}
            onChange={(event) => {
              replaceQuestion(index, {
                ...question,
                prompt: event.target.value,
              });
            }}
            placeholder={t("editor.question.promptPlaceholder")}
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
              {[
                { label: t("block.quiz.true"), value: 0 },
                { label: t("block.quiz.false"), value: 1 },
              ].map(({ label, value }) => (
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
              aria-label={t("editor.question.keywordsAria", {
                index: index + 1,
              })}
              onChange={(event) => {
                replaceQuestion(index, {
                  ...question,
                  answer: event.target.value,
                });
              }}
              placeholder={t("editor.question.keywordsPlaceholder")}
              value={question.answer}
            />
          ) : null}

          <Input
            aria-label={t("editor.question.explanationAria", {
              index: index + 1,
            })}
            onChange={(event) => {
              replaceQuestion(index, {
                ...question,
                explanation: event.target.value,
              });
            }}
            placeholder={t("editor.question.explanationPlaceholder")}
            value={question.explanation}
          />
        </div>
      ))}

      <AddRow
        label={t("editor.question.add")}
        onClick={() => {
          onChange({
            ...block,
            payload: {
              ...block.payload,
              questions: [...questions, newQuestion("single", t)],
            },
          });
        }}
      />
    </div>
  );
}

function FlashcardsForm({ block, onChange }: FormProps<"flashcards">) {
  const t = useT();
  const cards = block.payload.cards;

  function replaceCard(
    index: number,
    next: { front: string; back: string },
  ): void {
    onChange({
      ...block,
      payload: {
        ...block.payload,
        cards: cards.map((card, position) =>
          position === index ? next : card,
        ),
      },
    });
  }

  return (
    <div className="space-y-2">
      {cards.map((card, index) => (
        <div className="flex items-start gap-1.5" key={`card-${String(index)}`}>
          <div className="grid flex-1 gap-1.5">
            <Input
              aria-label={t("editor.card.frontAria", { index: index + 1 })}
              onChange={(event) => {
                replaceCard(index, { ...card, front: event.target.value });
              }}
              placeholder={t("editor.card.frontPlaceholder")}
              value={card.front}
            />
            <Input
              aria-label={t("editor.card.backAria", { index: index + 1 })}
              onChange={(event) => {
                replaceCard(index, { ...card, back: event.target.value });
              }}
              placeholder={t("editor.card.backPlaceholder")}
              value={card.back}
            />
          </div>
          <IconButton
            disabled={cards.length <= 1}
            label={t("editor.card.remove")}
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
        label={t("editor.card.add")}
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
  const t = useT();
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
        {t("editor.slide.autoplay")}
      </label>

      {slides.map((slide, index) => (
        <div
          className="space-y-2 rounded-lg border p-2.5"
          key={`slide-${String(index)}`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">
              {t("editor.slide.number", { index: index + 1 })}
            </p>
            <IconButton
              disabled={slides.length <= 1}
              label={t("editor.slide.remove")}
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
            aria-label={t("editor.slide.titleAria", { index: index + 1 })}
            onChange={(event) => {
              replaceSlide(index, { ...slide, title: event.target.value });
            }}
            placeholder={t("editor.slide.titlePlaceholder")}
            value={slide.title}
          />

          <Field
            hint={t("editor.slide.bulletsHint")}
            label={t("editor.slide.bullets")}
          >
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
              placeholder={t("editor.slide.bulletsPlaceholder")}
              rows={3}
              value={slide.bullets.join("\n")}
            />
          </Field>

          <Field
            hint={t("editor.slide.narrationHint")}
            label={t("editor.slide.narration")}
          >
            <Textarea
              onChange={(event) => {
                replaceSlide(index, {
                  ...slide,
                  narration: event.target.value,
                });
              }}
              placeholder={t("editor.slide.narrationPlaceholder")}
              rows={3}
              value={slide.narration}
            />
          </Field>
        </div>
      ))}

      <AddRow
        label={t("editor.slide.add")}
        onClick={() => {
          onChange({
            ...block,
            payload: {
              ...block.payload,
              slides: [...slides, { title: "", bullets: [], narration: "" }],
            },
          });
        }}
      />
    </div>
  );
}

function CodingForm({ block, onChange }: FormProps<"coding">) {
  const t = useT();
  const { problem, starter, tests, hints } = block.payload;

  return (
    <div className="space-y-3">
      <Field label={t("editor.coding.problem")}>
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, problem: event.target.value },
            });
          }}
          placeholder={t("editor.coding.problemPlaceholder")}
          rows={4}
          value={problem}
        />
      </Field>

      <Field hint="JavaScript" label={t("editor.coding.starter")}>
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
        <p className="text-xs font-medium">{t("editor.coding.tests")}</p>
        {tests.map((test, index) => (
          <div
            className="flex items-start gap-1.5"
            key={`test-${String(index)}`}
          >
            <Input
              aria-label={t("editor.coding.testNameAria", { index: index + 1 })}
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
              placeholder={t("editor.coding.testNamePlaceholder")}
              value={test.name}
            />
            <Input
              aria-label={t("editor.coding.testExpressionAria", {
                index: index + 1,
              })}
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
              label={t("editor.coding.testRemove")}
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
          label={t("editor.coding.testAdd")}
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
        <p className="text-xs font-medium">{t("editor.coding.hints")}</p>
        {hints.map((hint, index) => (
          <div
            className="flex items-center gap-1.5"
            key={`hint-${String(index)}`}
          >
            <Input
              aria-label={t("editor.coding.hintAria", { index: index + 1 })}
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
              placeholder={t("editor.coding.hintPlaceholder")}
              value={hint}
            />
            <IconButton
              label={t("editor.coding.hintRemove")}
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
          label={t("editor.coding.hintAdd")}
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
  const t = useT();
  const payload = block.payload;
  const sortedItems =
    payload.variant === "sort"
      ? [...payload.items].sort((a, b) => a.order - b.order)
      : [];
  function updateItems(items: typeof sortedItems): void {
    onChange({
      ...block,
      payload: {
        variant: "sort",
        items: items.map((item, order) => ({ ...item, order })),
      },
    });
  }
  function moveItem(index: number, delta: number): void {
    const items = [...sortedItems];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    updateItems(items);
  }

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
      <Field label={t("editor.game.variant")}>
        <select
          className={SELECT_CLASS}
          onChange={(event) => {
            switchVariant(event.target.value === "match" ? "match" : "sort");
          }}
          value={payload.variant}
        >
          <option value="sort">{t("editor.game.sort")}</option>
          <option value="match">{t("editor.game.match")}</option>
        </select>
      </Field>

      {payload.variant === "sort" ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t("editor.game.items")}</p>
          {sortedItems.map((item, index) => (
            <div
              className="flex items-center gap-1.5"
              key={`item-${String(index)}`}
            >
              <Input
                aria-label={t("editor.game.itemTextAria", { index: index + 1 })}
                onChange={(event) => {
                  updateItems(
                    sortedItems.map((entry, position) =>
                      position === index
                        ? { ...entry, text: event.target.value }
                        : entry,
                    ),
                  );
                }}
                placeholder={t("editor.game.itemTextPlaceholder")}
                value={item.text}
              />
              <span className="text-xs tabular-nums">{index + 1}</span>
              <IconButton
                label={t("activity.moveUp")}
                disabled={index === 0}
                onClick={() => moveItem(index, -1)}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                label={t("activity.moveDown")}
                disabled={index === sortedItems.length - 1}
                onClick={() => moveItem(index, 1)}
              >
                <ArrowDown />
              </IconButton>
              <IconButton
                disabled={payload.items.length <= 2}
                label={t("editor.game.itemRemove")}
                onClick={() => {
                  updateItems(
                    sortedItems.filter((_, position) => position !== index),
                  );
                }}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            {t("editor.game.orderHint")}
          </p>
          <AddRow
            label={t("editor.game.itemAdd")}
            onClick={() => {
              updateItems([
                ...sortedItems,
                { text: "", order: sortedItems.length },
              ]);
            }}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t("editor.game.pairs")}</p>
          {payload.pairs.map((pair, index) => (
            <div
              className="flex items-center gap-1.5"
              key={`pair-${String(index)}`}
            >
              <Input
                aria-label={t("editor.game.leftAria", { index: index + 1 })}
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
                placeholder={t("editor.game.leftPlaceholder")}
                value={pair.left}
              />
              <Input
                aria-label={t("editor.game.rightAria", { index: index + 1 })}
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
                placeholder={t("editor.game.rightPlaceholder")}
                value={pair.right}
              />
              <IconButton
                disabled={payload.pairs.length <= 2}
                label={t("editor.game.pairRemove")}
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
            label={t("editor.game.pairAdd")}
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

function SimulationForm({ block, onChange }: FormProps<"simulation">) {
  const t = useT();
  const payload = block.payload;
  const ids = Object.keys(payload.nodes);
  const validation = simulationBlockSchema.safeParse(block);
  function emit(next: typeof payload): void {
    onChange({ ...block, payload: next });
  }
  function updateNode(id: string, node: (typeof payload.nodes)[string]): void {
    emit({ ...payload, nodes: { ...payload.nodes, [id]: node } });
  }
  function nodeSelect(
    label: string,
    value: string,
    change: (id: string) => void,
  ) {
    return (
      <Field label={label}>
        <select
          className={SELECT_CLASS}
          value={value}
          onChange={(e) => change(e.target.value)}
        >
          {!ids.includes(value) ? (
            <option value={value}>
              {t("activity.invalidTarget")}: {value}
            </option>
          ) : null}
          {ids.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <div className="space-y-3">
      {validation.success ? null : (
        <ul
          role="alert"
          className="list-disc rounded-lg border border-destructive/40 p-3 pl-6 text-xs text-destructive"
        >
          {validation.error.issues.map((issue, i) => (
            <li key={i}>
              {issue.path.join(".")}: {issue.message}
            </li>
          ))}
        </ul>
      )}
      <Field label={t("activity.intro")}>
        <Textarea
          value={payload.intro}
          onChange={(e) => emit({ ...payload, intro: e.target.value })}
        />
      </Field>
      {nodeSelect(t("activity.startNode"), payload.start, (start) =>
        emit({ ...payload, start }),
      )}
      {nodeSelect(t("activity.endNode"), payload.end, (end) =>
        emit({
          ...payload,
          end,
          nodes: {
            ...payload.nodes,
            [end]: { ...payload.nodes[end], options: [] },
          },
        }),
      )}
      {ids.map((id) => {
        const node = payload.nodes[id];
        return (
          <fieldset key={id} className="space-y-2 rounded-lg border p-3">
            <legend className="text-xs font-medium">
              {id}
              {id === payload.end ? ` · ${t("activity.endNode")}` : ""}
            </legend>
            <Field label={t("activity.nodeText")}>
              <Textarea
                value={node.text}
                onChange={(e) =>
                  updateNode(id, { ...node, text: e.target.value })
                }
              />
            </Field>
            {id === payload.end
              ? null
              : node.options.map((option, index) => {
                  const change = (patch: Partial<typeof option>) =>
                    updateNode(id, {
                      ...node,
                      options: node.options.map((old, i) =>
                        i === index ? { ...old, ...patch } : old,
                      ),
                    });
                  return (
                    <div
                      key={index}
                      className="space-y-2 rounded-lg bg-muted/40 p-2"
                    >
                      <Field label={t("activity.optionLabel")}>
                        <Input
                          value={option.label}
                          onChange={(e) => change({ label: e.target.value })}
                        />
                      </Field>
                      {nodeSelect(t("activity.target"), option.next, (next) =>
                        change({ next }),
                      )}
                      <Field label={t("activity.feedback")}>
                        <Textarea
                          value={option.feedback}
                          onChange={(e) => change({ feedback: e.target.value })}
                        />
                      </Field>
                      <Field label={t("activity.points")}>
                        <Input
                          type="number"
                          step="any"
                          value={option.score}
                          onChange={(e) =>
                            change({ score: Number(e.target.value) })
                          }
                        />
                      </Field>
                      <IconButton
                        label={t("editor.option.remove")}
                        onClick={() =>
                          updateNode(id, {
                            ...node,
                            options: node.options.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  );
                })}
            {id === payload.end ? null : (
              <AddRow
                label={t("editor.option.add")}
                onClick={() =>
                  updateNode(id, {
                    ...node,
                    options: [
                      ...node.options,
                      { label: "", next: payload.end, feedback: "", score: 0 },
                    ],
                  })
                }
              />
            )}
            <Button
              size="xs"
              variant="ghost"
              disabled={id === payload.start || id === payload.end}
              onClick={() => {
                const nodes = Object.fromEntries(
                  Object.entries(payload.nodes).filter(([key]) => key !== id),
                );
                emit({ ...payload, nodes });
              }}
            >
              {t("activity.deleteNode")}
            </Button>
          </fieldset>
        );
      })}
      <p className="text-xs text-muted-foreground">{t("activity.nodeHint")}</p>
      <AddRow
        label={t("activity.addNode")}
        onClick={() => {
          const id = `node-${crypto.randomUUID().slice(0, 8)}`;
          emit({
            ...payload,
            nodes: {
              ...payload.nodes,
              [id]: {
                text: "",
                options: [
                  { label: "", next: payload.end, feedback: "", score: 0 },
                ],
              },
            },
          });
        }}
      />
    </div>
  );
}

function RoleplayForm({ block, onChange }: FormProps<"roleplay">) {
  const t = useT();
  const { scenario, persona, goal, rubric } = block.payload;

  return (
    <div className="space-y-3">
      <Field label={t("editor.roleplay.scenario")}>
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, scenario: event.target.value },
            });
          }}
          placeholder={t("editor.roleplay.scenarioPlaceholder")}
          rows={3}
          value={scenario}
        />
      </Field>

      <Field label={t("editor.roleplay.persona")}>
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, persona: event.target.value },
            });
          }}
          placeholder={t("editor.roleplay.personaPlaceholder")}
          rows={3}
          value={persona}
        />
      </Field>

      <Field label={t("editor.roleplay.goal")}>
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, goal: event.target.value },
            });
          }}
          placeholder={t("editor.roleplay.goalPlaceholder")}
          rows={2}
          value={goal}
        />
      </Field>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">{t("editor.roleplay.rubric")}</p>
        {rubric.map((criterion, index) => (
          <div
            className="flex items-center gap-1.5"
            key={`criterion-${String(index)}`}
          >
            <Input
              aria-label={t("editor.roleplay.criterionAria", {
                index: index + 1,
              })}
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
              placeholder={t("editor.roleplay.criterionPlaceholder")}
              value={criterion}
            />
            <IconButton
              disabled={rubric.length <= 1}
              label={t("editor.roleplay.criterionRemove")}
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
          label={t("editor.roleplay.criterionAdd")}
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
  const t = useT();

  return (
    <div className="space-y-3">
      <Field label={t("editor.reflection.prompt")}>
        <Textarea
          onChange={(event) => {
            onChange({
              ...block,
              payload: { ...block.payload, prompt: event.target.value },
            });
          }}
          placeholder={t("editor.reflection.promptPlaceholder")}
          rows={4}
          value={block.payload.prompt}
        />
      </Field>

      <Field
        hint={t("editor.reflection.wordsHint")}
        label={t("editor.reflection.minLength")}
      >
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
