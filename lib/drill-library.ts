import type { CoachDiagnosis, ConstraintType } from '@/lib/coach-diagnosis';

export type Drill = {
  id: string;
  name: string;
  durationMin: number;
  repsText: string;
  setupText: string;
  explanation: string;
  successMetricText: string;
  tags: string[];
};

export type DeterministicPlan = {
  durationMin: 20 | 40;
  targetText: string;
  warmup: Drill;
  drills: Drill[];
  testSet: Drill;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const drillLibrary: Record<
  ConstraintType,
  {
    warmup: Omit<Drill, 'durationMin' | 'successMetricText'>;
    drills: Array<Omit<Drill, 'durationMin' | 'successMetricText'>>;
    testSet: Omit<Drill, 'durationMin' | 'successMetricText'>;
  }
> = {
  DirectionConsistency: {
    warmup: {
      id: 'dir-warmup',
      name: 'Start-Line Baseline Warmup',
      repsText: '8 balls',
      setupText: 'One alignment stick at target, one for feet. Use one stock shot shape.',
      explanation: 'Builds a baseline start-line pattern before constraint-focused work.',
      tags: ['direction', 'warmup', 'start-line']
    },
    drills: [
      {
        id: 'dir-alignment-gate',
        name: 'Alignment Gate',
        repsText: '12 balls',
        setupText: 'Create a 2-stick gate 10-15 yards ahead; ball must start through gate.',
        explanation: 'Directly reduces offline spread by tightening initial launch direction.',
        tags: ['direction', 'alignment']
      },
      {
        id: 'dir-start-line-ladder',
        name: 'Start-Line Ladder',
        repsText: '3 rounds x 4 balls',
        setupText: 'Alternate narrow/medium/wide start-line windows while keeping same target.',
        explanation: 'Progressively challenges directional precision while preserving repeatable setup.',
        tags: ['direction', 'ladder']
      },
      {
        id: 'dir-random-target',
        name: 'Random Target Test',
        repsText: '10 balls',
        setupText: 'Switch target every ball; keep same pre-shot alignment routine.',
        explanation: 'Transfers improved start-line control into variable on-course style decisions.',
        tags: ['direction', 'transfer']
      }
    ],
    testSet: {
      id: 'dir-test',
      name: 'Direction Retest Set',
      repsText: '8 balls',
      setupText: 'Repeat baseline target and compare dispersion window vs warmup.',
      explanation: 'Confirms whether directional dispersion improved within the same session.',
      tags: ['direction', 'test']
    }
  },
  FaceControl: {
    warmup: {
      id: 'face-warmup',
      name: 'Face Awareness Warmup',
      repsText: '8 balls',
      setupText: 'Half speed swings with one intended curve and centered contact focus.',
      explanation: 'Calibrates face-to-path awareness before higher-intensity reps.',
      tags: ['face', 'warmup']
    },
    drills: [
      {
        id: 'face-half-swing',
        name: 'Half Swing Face Drill',
        repsText: '12 balls',
        setupText: '9-to-3 swing length; hold finish and note face-to-path after each ball.',
        explanation: 'Reduces face control noise by simplifying motion and emphasizing face delivery.',
        tags: ['face', 'control']
      },
      {
        id: 'face-tee-gate',
        name: 'Tee Gate Start Control',
        repsText: '10 balls',
        setupText: 'Set a tee gate ahead of ball and start each shot through the same window.',
        explanation: 'Links face control to predictable start line outcomes.',
        tags: ['face', 'start-line']
      },
      {
        id: 'face-lead-wrist',
        name: 'Lead Wrist Control Cue',
        repsText: '10 balls',
        setupText: 'Use one lead-wrist checkpoint at P6/P7 and hold same cue each rep.',
        explanation: 'Stabilizes face orientation through impact with a single repeatable cue.',
        tags: ['face', 'mechanics']
      }
    ],
    testSet: {
      id: 'face-test',
      name: 'Face-To-Path Retest',
      repsText: '8 balls',
      setupText: 'Return to stock swings and check face-to-path stability.',
      explanation: 'Verifies whether face-to-path variability improved under normal speed.',
      tags: ['face', 'test']
    }
  },
  DistanceControl: {
    warmup: {
      id: 'dist-warmup',
      name: 'Carry Baseline Warmup',
      repsText: '8 balls',
      setupText: 'Stock tempo swings to one carry target with same club.',
      explanation: 'Sets a carry baseline so later variance reductions are measurable.',
      tags: ['distance', 'warmup']
    },
    drills: [
      {
        id: 'dist-tempo-ladder',
        name: 'Tempo Ladder',
        repsText: '3 rounds x 4 balls',
        setupText: 'Cycle tempo cues (smooth/stock/smooth) while holding carry window.',
        explanation: 'Improves carry consistency by stabilizing rhythm-driven speed changes.',
        tags: ['distance', 'tempo']
      },
      {
        id: 'dist-3-ball-average',
        name: '3-Ball Average Game',
        repsText: '4 sets x 3 balls',
        setupText: 'Score each set by average carry distance to reduce one-off swings.',
        explanation: 'Promotes repeatable distance output instead of chasing single best shots.',
        tags: ['distance', 'consistency']
      },
      {
        id: 'dist-windows',
        name: 'Distance Windows',
        repsText: '10 balls',
        setupText: 'Hit to a fixed carry band; reset when two consecutive balls miss window.',
        explanation: 'Builds control inside a practical carry tolerance window.',
        tags: ['distance', 'window']
      }
    ],
    testSet: {
      id: 'dist-test',
      name: 'Carry Variance Retest',
      repsText: '8 balls',
      setupText: 'Repeat initial carry target and compare spread to warmup set.',
      explanation: 'Checks whether carry standard deviation is shrinking vs baseline.',
      tags: ['distance', 'test']
    }
  },
  StrikeQuality: {
    warmup: {
      id: 'strike-warmup',
      name: 'Contact Baseline Warmup',
      repsText: '8 balls',
      setupText: 'Centered contact priority with face tape or strike spray.',
      explanation: 'Establishes current strike pattern before contact optimization drills.',
      tags: ['strike', 'warmup']
    },
    drills: [
      {
        id: 'strike-tape-check',
        name: 'Strike Tape Check',
        repsText: '12 balls',
        setupText: 'Mark strike location each shot; adjust setup only after 3-ball clusters.',
        explanation: 'Creates feedback loops that improve center-face strike consistency.',
        tags: ['strike', 'contact']
      },
      {
        id: 'strike-tee-height-lowpoint',
        name: 'Tee Height / Low Point Drill',
        repsText: '10 balls',
        setupText: 'Alternate tee heights (or low-point marker) and hold contact pattern.',
        explanation: 'Improves strike quality by controlling vertical strike and low-point delivery.',
        tags: ['strike', 'low-point']
      },
      {
        id: 'strike-center-contact-ladder',
        name: 'Center Contact Ladder',
        repsText: '3 rounds x 4 balls',
        setupText: 'Progress from half to stock speed only when contact stays centered.',
        explanation: 'Builds speed only after contact quality is stable, protecting smash consistency.',
        tags: ['strike', 'ladder']
      }
    ],
    testSet: {
      id: 'strike-test',
      name: 'Smash Stability Retest',
      repsText: '8 balls',
      setupText: 'Return to stock speed and verify smash variability reduction.',
      explanation: 'Validates whether strike efficiency volatility has improved.',
      tags: ['strike', 'test']
    }
  }
};

const inferTargetFromDiagnosis = (diagnosis: CoachDiagnosis) => {
  const primary = diagnosis.primary;
  const metrics = primary.keyMetrics;

  const reduceTarget = (metricLabel: string, value: number | null) => {
    if (typeof value !== 'number') {
      return `Improve ${metricLabel} by 15-20% over next 3 sessions.`;
    }
    return `Reduce ${metricLabel} from ${round1(value)} to ${round1(value * 0.82)} over next 3 sessions.`;
  };

  if (primary.constraintType === 'DirectionConsistency') {
    return reduceTarget('offlineStdDev', (metrics.offlineStdDev as number | null) ?? null);
  }
  if (primary.constraintType === 'FaceControl') {
    return reduceTarget('faceToPathStdDev', (metrics.faceToPathStdDev as number | null) ?? null);
  }
  if (primary.constraintType === 'DistanceControl') {
    return reduceTarget('carryStdDev', (metrics.carryStdDev as number | null) ?? null);
  }
  return reduceTarget('smashStdDev', (metrics.smashStdDev as number | null) ?? null);
};

const withDurationAndMetric = (
  drill: Omit<Drill, 'durationMin' | 'successMetricText'>,
  durationMin: number,
  successMetricText: string
): Drill => ({
  ...drill,
  durationMin,
  successMetricText
});

export const generateDeterministicPlan = (
  diagnosis: CoachDiagnosis,
  durationMin: 20 | 40 = 20
): DeterministicPlan => {
  const targetText = inferTargetFromDiagnosis(diagnosis);
  const library = drillLibrary[diagnosis.primary.constraintType];

  const warmupMin = durationMin === 20 ? 4 : 8;
  const eachDrillMin = durationMin === 20 ? 4 : 8;
  const testMin = durationMin === 20 ? 4 : 8;

  const warmup = withDurationAndMetric(
    library.warmup,
    warmupMin,
    `Establish baseline for ${diagnosis.primary.constraintType} on ${diagnosis.primary.club}.`
  );

  const drills = library.drills.slice(0, 3).map((drill) =>
    withDurationAndMetric(
      drill,
      eachDrillMin,
      `${targetText} Track execution quality each set.`
    )
  );

  const testSet = withDurationAndMetric(
    library.testSet,
    testMin,
    `Validate progress against target: ${targetText}`
  );

  return {
    durationMin,
    targetText,
    warmup,
    drills,
    testSet
  };
};
