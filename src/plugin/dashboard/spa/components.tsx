import type { ComponentChildren, JSX } from 'preact';

export function Panel(props: {
  title: string;
  badge?: ComponentChildren | undefined;
  intro?: string | undefined;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <section class="module-panel">
      <div class="module-panel__head">
        <h1>{props.title}</h1>
        {props.badge ? <span class="module-panel__badge">{props.badge}</span> : null}
      </div>
      {props.intro ? <p class="module-panel__intro">{props.intro}</p> : null}
      {props.children}
    </section>
  );
}

export function Card(props: { title?: string | undefined; children: ComponentChildren; class?: string | undefined }): JSX.Element {
  return (
    <div class={`module-panel__card ${props.class ?? ''}`}>
      {props.title ? <h2 class="card-title">{props.title}</h2> : null}
      {props.children}
    </div>
  );
}

export function Kpi(props: { label: string; value: ComponentChildren; hint?: string | undefined }): JSX.Element {
  return (
    <div class="kpi">
      <div class="kpi__label">{props.label}</div>
      <div class="kpi__value">{props.value}</div>
      {props.hint ? <div class="kpi__hint">{props.hint}</div> : null}
    </div>
  );
}

export function Chip(props: { tone?: 'info' | 'success' | 'warn' | 'danger' | 'muted'; children: ComponentChildren }): JSX.Element {
  return <span class={`chip chip--${props.tone ?? 'muted'}`}>{props.children}</span>;
}

export function Segment<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div class="seg" role="tablist">
      {props.options.map((o) => (
        <button
          key={o.value}
          class={`seg__btn ${props.value === o.value ? 'seg__btn--active' : ''}`}
          onClick={() => props.onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }): JSX.Element {
  return (
    <label class="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
      <span class="toggle__track"><span class="toggle__thumb" /></span>
      {props.label ? <span class="toggle__label">{props.label}</span> : null}
    </label>
  );
}

export function EmptyState(props: { message: string; hint?: string }): JSX.Element {
  return (
    <div class="state state--empty">
      <div class="state__title">{props.message}</div>
      {props.hint ? <div class="state__hint">{props.hint}</div> : null}
    </div>
  );
}

export function LoadingState(props: { message: string }): JSX.Element {
  return <div class="state state--loading">{props.message}</div>;
}

export function ErrorState(props: { message: string }): JSX.Element {
  return <div class="state state--error">{props.message}</div>;
}

export function Field(props: { label: string; children: ComponentChildren; hint?: string | undefined }): JSX.Element {
  return (
    <label class="field">
      <span class="field__label">{props.label}</span>
      {props.children}
      {props.hint ? <span class="field__hint">{props.hint}</span> : null}
    </label>
  );
}
