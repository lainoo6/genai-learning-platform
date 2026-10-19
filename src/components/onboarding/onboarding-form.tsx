"use client";

import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BACKGROUND_OPTIONS,
  GOAL_OPTIONS,
  type Background,
  type Goal,
  type LearnerProfile,
} from "@/lib/profile";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { OnboardingState } from "@/server/onboarding";

/**
 * Three-step onboarding wizard.
 *
 * Every step stays mounted (inactive ones are hidden with CSS) so the answers
 * are part of the form on submit — no mirrored hidden inputs, and the native
 * radio group keeps its keyboard navigation.
 */

const STEP_TITLE_KEYS = [
  "onboarding.step.background",
  "onboarding.step.goals",
  "onboarding.step.final",
] as const;
const LAST_STEP = STEP_TITLE_KEYS.length - 1;

const INITIAL_STATE: OnboardingState = { error: null };

type OnboardingFormProps = {
  action: (
    state: OnboardingState,
    formData: FormData,
  ) => Promise<OnboardingState>;
  /** Existing answers when the wizard is re-opened from the dashboard. */
  initialProfile: LearnerProfile | null;
  nextHref?: string;
};

export function OnboardingForm({
  action,
  initialProfile,
  nextHref = "/dashboard",
}: OnboardingFormProps) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [showError, setShowError] = useState(false);

  const [background, setBackground] = useState<Background | null>(
    initialProfile?.background ?? null,
  );
  const [backgroundNote, setBackgroundNote] = useState(
    initialProfile?.backgroundNote ?? "",
  );
  const [goals, setGoals] = useState<Goal[]>(initialProfile?.goals ?? []);
  const [goalNote, setGoalNote] = useState(initialProfile?.goalNote ?? "");
  const [statement, setStatement] = useState(initialProfile?.statement ?? "");

  const isEditing = initialProfile !== null;
  const stepComplete = [
    background !== null,
    goals.length > 0,
    true,
  ];

  function toggleGoal(goal: Goal, checked: boolean): void {
    setGoals((previous) => {
      if (checked) {
        return previous.includes(goal) ? previous : [...previous, goal];
      }
      return previous.filter((entry) => entry !== goal);
    });
    setShowError(false);
  }

  function goToNextStep(): void {
    if (!stepComplete[step]) {
      setShowError(true);
      return;
    }

    setShowError(false);
    setStep((current) => Math.min(current + 1, LAST_STEP));
  }

  function goToPreviousStep(): void {
    setShowError(false);
    setStep((current) => Math.max(current - 1, 0));
  }

  /**
   * The primary button is always `type="button"`. Rendering it as a submit
   * button on the last step would turn the "Next" click that reaches the last
   * step into a form submission: React re-renders before the browser runs the
   * click's default action, so the button would already be a submitter.
   */
  function handlePrimaryAction(): void {
    if (step < LAST_STEP) {
      goToNextStep();
      return;
    }

    if (!canSubmit) {
      setShowError(true);
      return;
    }

    formRef.current?.requestSubmit();
  }

  const canSubmit = stepComplete[0] === true && stepComplete[1] === true;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="gap-3">
        <div aria-hidden="true" className="flex gap-1.5">
          {STEP_TITLE_KEYS.map((titleKey, index) => (
            <span
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                index <= step ? "bg-primary" : "bg-muted",
              )}
              key={titleKey}
            />
          ))}
        </div>
        <CardTitle className="text-lg">
          {isEditing ? t("onboarding.title.edit") : t("onboarding.title.new")}
        </CardTitle>
        <CardDescription>
          {t("onboarding.stepPosition", {
            step: step + 1,
            total: STEP_TITLE_KEYS.length,
            title: t(STEP_TITLE_KEYS[step]),
          })}
        </CardDescription>
      </CardHeader>

      <form action={formAction} className="contents" ref={formRef}>
        <CardContent className="space-y-4">
          <div className={cn("space-y-4", step === 0 ? undefined : "hidden")}>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("onboarding.background.legend")}
              </legend>

              {BACKGROUND_OPTIONS.map((option) => (
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent",
                  )}
                  key={option.value}
                >
                  <input
                    checked={background === option.value}
                    className="mt-0.5 size-4 accent-primary"
                    name="background"
                    onChange={() => {
                      setBackground(option.value);
                      setShowError(false);
                    }}
                    type="radio"
                    value={option.value}
                  />
                  <span>
                    <span className="block font-medium">{t(option.labelKey)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(option.hintKey)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="backgroundNote">
                {t("onboarding.background.note.label")}
              </Label>
              <Input
                id="backgroundNote"
                name="backgroundNote"
                onChange={(event) => setBackgroundNote(event.target.value)}
                placeholder={t("onboarding.background.note.placeholder")}
                value={backgroundNote}
              />
            </div>
          </div>

          <div className={cn("space-y-4", step === 1 ? undefined : "hidden")}>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("onboarding.goals.legend")}
              </legend>

              {GOAL_OPTIONS.map((option) => (
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent"
                  key={option.value}
                >
                  <Checkbox
                    checked={goals.includes(option.value)}
                    onCheckedChange={(checked) =>
                      toggleGoal(option.value, checked === true)
                    }
                  />
                  <span className="font-medium">{t(option.labelKey)}</span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="goalNote">
                {t("onboarding.goals.note.label")}
              </Label>
              <Input
                id="goalNote"
                name="goalNote"
                onChange={(event) => setGoalNote(event.target.value)}
                placeholder={t("onboarding.goals.note.placeholder")}
                value={goalNote}
              />
            </div>
          </div>

          <div className={cn("space-y-4", step === 2 ? undefined : "hidden")}>
            <div className="space-y-1.5">
              <Label htmlFor="statement">
                {t("onboarding.statement.label")}
              </Label>
              <Textarea
                id="statement"
                name="statement"
                onChange={(event) => setStatement(event.target.value)}
                placeholder={t("onboarding.statement.placeholder")}
                value={statement}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("onboarding.statement.hint")}
            </p>
          </div>

          {goals.map((goal) => (
            <input key={goal} name="goals" type="hidden" value={goal} />
          ))}
          <input name="next" type="hidden" value={nextHref} />

          {showError && !stepComplete[step] ? (
            <p className="text-sm text-destructive" role="alert">
              {step === 0
                ? t("onboarding.error.background")
                : t("onboarding.error.goals")}
            </p>
          ) : null}

          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
        </CardContent>

        <CardFooter className="flex-wrap justify-between gap-2">
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button
                onClick={goToPreviousStep}
                type="button"
                variant="ghost"
              >
                <ArrowLeft aria-hidden="true" />
                {t("onboarding.button.back")}
              </Button>
            ) : isEditing ? (
              <Link
                className={buttonVariants({ variant: "ghost" })}
                href="/dashboard"
              >
                {t("onboarding.button.cancel")}
              </Link>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {isEditing && step === LAST_STEP ? (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href="/dashboard"
              >
                {t("onboarding.button.skip")}
              </Link>
            ) : null}

            <Button disabled={isPending} onClick={handlePrimaryAction} type="button">
              {step < LAST_STEP ? (
                <>
                  {t("onboarding.button.next")}
                  <ArrowRight aria-hidden="true" />
                </>
              ) : (
                <>
                  <Sparkles aria-hidden="true" />
                  {isPending
                    ? t("onboarding.button.saving")
                    : isEditing
                      ? t("onboarding.button.save")
                      : t("onboarding.button.start")}
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
