'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CoachConstraintKey, CoachV2Plan, PracticePlanStep } from '@/types/coach';
import { AppCard, AppHeaderBar, AppPageShell } from '@/components/app-shell';

type RangeModeShellProps = {
  isSignedIn: boolean;
};

type RangePayload = {
  sessionsCount: number;
  coachV2Plan: CoachV2Plan | null;
};

type ShotLogKey = 'center' | 'slightRight' | 'slightLeft' | 'missRight' | 'missLeft';

type RangeState = {
  focusLabel: string;
  goalLine: string;
  focusProgressPct: number;
  patternLabel: string;
  tendencyLine: string;
  drills: Array<{
    title: string;
    cue: string;
    targetShots: number;
  }>;
};

const shotOptions: Array<{ key: ShotLogKey; label: string }> = [
  { key: 'center', label: 'Center' },
  { key: 'slightRight', label: 'Slight Right' },
  { key: 'slightLeft', label: 'Slight Left' },
  { key: 'missRight', label: 'Miss Right' },
  { key: 'missLeft', label: 'Miss Left' }
];

const placeholderState: RangeState = {
  focusLabel: '7i Direction Control',
  goalLine: 'Goal: Dispersion <= +/-12y',
  focusProgressPct: 42,
  patternLabel: 'Push Fade',
  tendencyLine: 'Miss Tendency: Right',
  drills: [
    {
      title: 'Alignment Gate',
      cue: 'Start every ball through the same window before you add speed.',
      targetShots: 10
    },
    {
      title: 'Face Control Drill',
      cue: 'Half speed first. Match face delivery to the start line.',
      targetShots: 12
    },
    {
      title: 'Random Target Challenge',
      cue: 'Change target each ball and hold the same start-line discipline.',
      targetShots: 8
    }
  ]
};

const parseShotCount = (reps: string) => {
  const match = reps.match(/(\d+)/);
  return match ? Number(match[1]) : 10;
};

const toCoachFocusLabel = (key: CoachConstraintKey) => {
  if (key === 'direction_consistency') return 'Direction Control';
  if (key === 'distance_control') return 'Distance Control';
  if (key === 'strike_quality') return 'Strike Quality';
  return 'Distance Gapping';
};

const formatFocusLabel = (plan: CoachV2Plan) => {
  const club = plan.primaryConstraint.focusClub?.trim();
  const label = toCoachFocusLabel(plan.primaryConstraint.key);
  return club ? `${club} ${label}` : label;
};

const formatGoalLine = (plan: CoachV2Plan) => {
  const { targetMetric, currentValue, targetValue } = plan.primaryConstraint;

  if (currentValue !== null && targetValue !== null) {
    const metric = targetMetric.toLowerCase().includes('yd')
      ? 'Dispersion'
      : targetMetric.toLowerCase().includes('smash')
        ? 'Strike'
        : targetMetric.toLowerCase().includes('carry')
          ? 'Carry Window'
          : 'Goal';
    const formattedTarget = Number.isInteger(targetValue) ? targetValue.toFixed(0) : targetValue.toFixed(1);
    return `Goal: ${metric} <= ${formattedTarget}${targetMetric.toLowerCase().includes('yd') ? 'y' : ''}`;
  }

  return `Goal: ${plan.practicePlan.goal}`;
};

const clampPercent = (value: number) => Math.min(100, Math.max(8, Math.round(value)));

const computeFocusProgress = (plan: CoachV2Plan) => {
  const { currentValue, targetValue } = plan.primaryConstraint;
  if (currentValue === null || targetValue === null || currentValue === 0) return 36;

  if (targetValue < currentValue) {
    const improvement = ((currentValue - targetValue) / currentValue) * 100;
    return clampPercent(improvement * 2.4);
  }

  const growth = ((targetValue - currentValue) / Math.max(1, targetValue)) * 100;
  return clampPercent(growth * 1.8);
};

const inferPattern = (key: CoachConstraintKey) => {
  if (key === 'direction_consistency') {
    return { patternLabel: 'Push Fade', tendencyLine: 'Miss Tendency: Right' };
  }
  if (key === 'distance_control') {
    return { patternLabel: 'Carry Drift', tendencyLine: 'Miss Tendency: Long-short swings' };
  }
  if (key === 'strike_quality') {
    return { patternLabel: 'Off-center Strike', tendencyLine: 'Miss Tendency: Thin-right pattern' };
  }
  return { patternLabel: 'Gap Drift', tendencyLine: 'Miss Tendency: Distance overlap' };
};

const buildCue = (step: PracticePlanStep) => {
  const objective = step.objective.toLowerCase();

  if (objective.includes('start line')) return 'Own the start line first. Same picture, same target, same window.';
  if (objective.includes('offline')) return 'Keep the face quieter through impact and hold your finish.';
  if (objective.includes('carry')) return 'Pick one stock number and stay inside that window.';
  if (objective.includes('strike')) return 'Make centered contact the only goal for this block.';
  if (objective.includes('pressure')) return 'Reset between balls and treat each shot as its own rep.';

  return `${step.objective}. Keep the cue simple and repeatable.`;
};

const toRangeState = (plan: CoachV2Plan): RangeState => {
  const pattern = inferPattern(plan.primaryConstraint.key);

  return {
    focusLabel: formatFocusLabel(plan),
    goalLine: formatGoalLine(plan),
    focusProgressPct: computeFocusProgress(plan),
    patternLabel: pattern.patternLabel,
    tendencyLine: pattern.tendencyLine,
    drills: plan.practicePlan.steps.map((step) => ({
      title: step.title,
      cue: buildCue(step),
      targetShots: parseShotCount(step.reps)
    }))
  };
};

export default function RangeModeShell({ isSignedIn }: RangeModeShellProps) {
  const [rangeState, setRangeState] = useState<RangeState>(placeholderState);
  const [isLoading, setIsLoading] = useState(isSignedIn);
  const [error, setError] = useState<string | null>(null);
  const [currentDrillIndex, setCurrentDrillIndex] = useState(0);
  const [shotLog, setShotLog] = useState<Record<ShotLogKey, number>>({
    center: 0,
    slightRight: 0,
    slightLeft: 0,
    missRight: 0,
    missLeft: 0
  });

  useEffect(() => {
    if (!isSignedIn) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadRangeMode = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/sessions/all-time', {
          cache: 'no-store',
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error('Could not load coach data.');
        }

        const payload = (await response.json()) as RangePayload;
        if (payload.coachV2Plan) {
          setRangeState(toRangeState(payload.coachV2Plan));
        }
      } catch (caughtError) {
        if ((caughtError as Error).name === 'AbortError') return;
        setError('Using a saved fallback plan for this practice.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadRangeMode();

    return () => controller.abort();
  }, [isSignedIn]);

  const currentDrill = rangeState.drills[currentDrillIndex] ?? rangeState.drills[0];
  const nextDrill = rangeState.drills[currentDrillIndex + 1] ?? null;
  const totalShotsLogged = Object.values(shotLog).reduce((sum, value) => sum + value, 0);
  const drillProgressPct = Math.min(100, Math.round((totalShotsLogged / Math.max(1, currentDrill.targetShots)) * 100));

  const shotSummary = useMemo(() => {
    const rightMisses = shotLog.slightRight + shotLog.missRight;
    const leftMisses = shotLog.slightLeft + shotLog.missLeft;

    if (rightMisses === leftMisses) return 'Pattern holding neutral.';
    return rightMisses > leftMisses ? 'Right side is still the main pattern.' : 'Left side is showing up more often.';
  }, [shotLog]);

  const handleShotLog = (key: ShotLogKey) => {
    setShotLog((current) => ({ ...current, [key]: current[key] + 1 }));
  };

  const handleFinishDrill = () => {
    if (nextDrill) {
      setCurrentDrillIndex((value) => value + 1);
      setShotLog({
        center: 0,
        slightRight: 0,
        slightLeft: 0,
        missRight: 0,
        missLeft: 0
      });
      return;
    }

    setShotLog({
      center: 0,
      slightRight: 0,
      slightLeft: 0,
      missRight: 0,
      missLeft: 0
    });
  };

  return (
    <AppPageShell className="range-mode-page">
      <AppHeaderBar title="Range Mode" backHref="/" className="range-top-bar" />

      {error ? <p className="helper-text range-helper-banner">{error}</p> : null}
      {isLoading ? <p className="helper-text range-helper-banner">Loading today&apos;s coach plan...</p> : null}

      <div className="range-stack">
        <AppCard title="Focus Summary" className="range-card" bodyClassName="range-card-body">
          <div className="range-focus-block">
            <p className="range-focus-title">{rangeState.focusLabel}</p>
            <p className="range-focus-goal">{rangeState.goalLine}</p>
            <div className="progress-bar range-focus-progress" aria-label="Focus progress">
              <div className="progress-fill" style={{ width: `${rangeState.focusProgressPct}%` }} />
            </div>
          </div>
        </AppCard>

        <AppCard title="Current Drill" className="range-card" bodyClassName="range-card-body">
          <div className="range-drill-block">
            <p className="range-drill-title">{currentDrill.title}</p>
            <p className="range-drill-cue">{currentDrill.cue}</p>
            <div className="range-drill-meta">
              <span>Shots: {totalShotsLogged} / {currentDrill.targetShots}</span>
              <span>{shotSummary}</span>
            </div>
            <div className="progress-bar range-drill-progress" aria-label="Drill progress">
              <div className="progress-fill" style={{ width: `${Math.max(8, drillProgressPct)}%` }} />
            </div>
          </div>
        </AppCard>

        <AppCard title="Current Pattern" className="range-card" bodyClassName="range-card-body">
          <div className="range-pattern-block">
            <p className="range-pattern-title">{rangeState.patternLabel}</p>
            <p className="range-pattern-copy">{rangeState.tendencyLine}</p>
          </div>
        </AppCard>

        <AppCard title="Quick Shot Log" className="range-card" bodyClassName="range-card-body">
          <div className="range-shot-grid">
            {shotOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className="secondary-button range-shot-button"
                onClick={() => handleShotLog(option.key)}
              >
                <span>{option.label}</span>
                <strong>{shotLog[option.key]}</strong>
              </button>
            ))}
          </div>
        </AppCard>

        <button type="button" className="primary-button range-finish-button" onClick={handleFinishDrill}>
          {nextDrill ? 'Finish Practice Block' : 'Finish Practice'}
        </button>

        {nextDrill ? (
          <AppCard title="Next Drill" className="range-card range-next-card" bodyClassName="range-card-body">
            <div className="range-next-block">
              <p className="range-next-title">{nextDrill.title}</p>
              <p className="range-next-metric">Target: {nextDrill.targetShots} committed reps</p>
              <p className="range-next-metric">{nextDrill.cue}</p>
            </div>
          </AppCard>
        ) : null}
      </div>
    </AppPageShell>
  );
}
