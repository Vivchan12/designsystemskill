# The guide pattern

Two files per tool, and a test for each. The logic lives in a plain module
you can test without a browser; the component only renders it. Hand this
file to every subagent building a guide.

## 1. The thinking module: `services/<tool>Thinking.ts`

```ts
/**
 * <Tool>'s guided path. The user decides <the N things only they can>;
 * this module gathers what the other tools already know, so each decision
 * is made against evidence rather than from memory. No AI here.
 */
export const STEPS = [{ label: 'Release goal' }, { label: 'What goes in' }, { label: 'Sort' }, { label: 'Job stories' }];

export interface Candidate {
  key: string;            // stable across renders: `${source}:${id}`
  text: string;
  source: 'experiment' | 'tree' | 'idea' | 'manual';
  evidence?: string;      // one line on why it deserves a place: "Passed: 17 of 50 (34%, bar 20%)"
  sourceId?: string;      // link back by id, never by copied text alone
}

/** Options for a step, strongest evidence first; anything already chosen is left out. */
export function candidates(state: AppState): Candidate[] {
  const taken = new Set(state.items.map(i => norm(i.text)));
  const out: Candidate[] = [];
  const add = (c: Candidate) => { if (c.text.trim() && !taken.has(norm(c.text))) { taken.add(norm(c.text)); out.push(c); } };
  // 1. what a real test backed  2. what's on the plan  3. ideas, best first
  …
  return out;
}

/** Where to reopen: the first step not yet done. */
export function firstUnfinishedStep(state: AppState): number { … }

/** Composers turn parts into the thing: a positioning line, a job story, a hypothesis.
 *  Empty parts drop out cleanly, with no "is that …" when the category is blank. */
export function compose(parts: Parts): string { … }

/** The result with no AI at all, so "Save without the draft" always works. */
export function userOnlyResult(choices: Choices): Result { … }
```

Rules:
- **No React, no fetch, no AI.** If it needs the state, take it as an argument.
- **Dedupe by normalised text *and* by source id**, so an item that came from an experiment isn't offered again from the tree.
- **Never invent content.** If there's nothing upstream, return an empty list and let the UI say so.

## 2. The guide component: `components/<Tool>Wizard.tsx`

```tsx
const ToolWizard: React.FC<{ state: AppState; onUpdate: Update; onDone: () => void }> = ({ state, onUpdate, onDone }) => {
  const [step, setStep] = useState(() => firstUnfinishedStep(state));
  // Work candidates out ONCE, on arrival: ticking one adds it to the state,
  // which must not make it vanish from the list mid-step.
  const [opts] = useState(() => candidates(state));
  const valid = [/* one boolean per step */];

  return (
    <Wizard steps={STEPS} current={step} onStepClick={setStep}
      onBack={() => setStep(s => s - 1)} onNext={next} nextDisabled={!valid[step]}
      onCancel={onDone} cancelLabel={hasAnything ? 'Finish for now' : 'Cancel'}
      finishLabel="Done"            /* or "Draft the full plan" with finishIsAI + a no-AI cancel */>
      {step === 0 && (
        <WizardStep kicker="Release goal" title="What is the next release for?"
          hint="One outcome for your customer. Everything that goes in should move it.">
          {opts.map(o => <OptionCard key={o.key} selected={…} onSelect={…} title={o.text} description={o.evidence} />)}
          <Field label="Or write your own"><Input … /></Field>
        </WizardStep>
      )}
      …
    </Wizard>
  );
};
```

Rules:
- **One question per step**, phrased as a question, with a hint saying why it matters.
- **Write as you go, or save once with a no-AI option.**
  - Writing as you go: leaving part-way keeps what was answered. Use this for lists, priorities and edits to existing items.
  - Saving at the end: use this when the result only makes sense whole (a positioning plus channels plus goals). The last step offers the AI draft *and* "Save without the draft".
- **AI on the last step only**, with the user's choices passed in and kept verbatim in the result, e.g. `generatePlaybook(state, { beachhead, positioning, channels, goals })`. On failure: "Nothing was changed. Try again, or save your choices without the draft."
- **Never block on the model.** Next is enabled by the user's own answer. A "Show suggestions" button may spend one AI call to offer options; picking one only fills the field.
- **A long label truncates; evidence goes on its own line** so it can wrap.

## 3. The mode switch on the tool

```tsx
const [guideMode, setGuideMode] = useState(isEmpty(state));   // empty → guide; content → full view
<Segmented value={guideMode ? 'guide' : 'full'} onChange={v => setGuideMode(v === 'guide')}
  options={[{ value: 'guide', label: 'Guide me' }, { value: 'full', label: 'Board' }]} />
{guideMode ? <ToolWizard … onDone={() => setGuideMode(false)} /> : <FullView … />}
```

The full view shows what the guide produced, including each item's
provenance: "Tested · Passed: 17 of 50", "From the Opportunity Tree".

## 4. Tests

**The thinking module (unit):**
- the order of candidates (evidence first);
- de-duplication across sources;
- that already-taken items are left out;
- the composers' grammar when parts are empty;
- `firstUnfinishedStep` at each stage.

**The guide (component):** render the tool with state where it's empty, then:
- pick an option and press Next, and check the state written;
- check Next is disabled until the step is answered;
- check the last step writes the right thing.

**The AI path:** mock the AI call, then check:
- the user's choices are passed through to the call;
- on failure, nothing was written.

**Prove each test:** break the code it covers, watch the test fail, then restore the code.

## 5. Briefing a subagent to build one guide

> Build the "<Tool>" guide following guide-pattern.md. Steps (signed off): <list>. Options come from: <tools/fields>. Write-as-you-go or save-at-end: <which>. AI: <none | last step drafts X, keeping Y verbatim>. Data-flow rules: references/data-flow.md (read, don't write, other tools' data; any write-back goes through <function>). Deliver: services/<tool>Thinking.ts + test, components/<Tool>Wizard.tsx, the mode switch on the tool, a component test walking the guide, and a screenshot per step. Work in your own worktree; don't commit to the shared branch.
