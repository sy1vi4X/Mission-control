"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TaskLevel = "must" | "should" | "side";
type ViewMode = "todo" | "done" | "all";
type LevelFilter = "all" | TaskLevel;

type Task = {
  id: string;
  title: string;
  level: TaskLevel;
  deadline: string | null;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
};

type Draft = {
  title: string;
  level: TaskLevel;
  deadlineMode: "today" | "tomorrow" | "pick" | "none";
  pickedDate: string;
};

const STORAGE_KEY = "mission-control.tasks.v1";
const INIT_KEY = "mission-control.initialized.v1";

const levelMeta: Record<TaskLevel, { label: string; mark: string }> = {
  must: { label: "MUST", mark: "M" },
  should: { label: "SHOULD", mark: "S" },
  side: { label: "SIDE QUEST", mark: "Q" },
};

const emptyDraft: Draft = {
  title: "",
  level: "must",
  deadlineMode: "tomorrow",
  pickedDate: "",
};

function isoToday(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function createDemoTasks(): Task[] {
  const now = new Date().toISOString();
  return [
    ["Economics HW", "must", "2026-08-31"],
    ["Enrichment component choosing", "should", "2026-08-31"],
    ["CS notes整理", "side", null],
    ["Drama vocab review", "side", null],
    ["Never Enough song practice", "side", null],
    ["Drama monologue - research / memorize", "side", null],
  ].map(([title, level, deadline], index) => ({
    id: `demo-${index + 1}`,
    title: title as string,
    level: level as TaskLevel,
    deadline: deadline as string | null,
    completed: false,
    createdAt: now,
    completedAt: null,
  }));
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Task;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    ["must", "should", "side"].includes(task.level) &&
    (typeof task.deadline === "string" || task.deadline === null) &&
    typeof task.completed === "boolean" &&
    typeof task.createdAt === "string" &&
    (typeof task.completedAt === "string" || task.completedAt === null)
  );
}

function loadTasks() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.filter(isTask);
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  if (window.localStorage.getItem(INIT_KEY)) return [];
  const demo = createDemoTasks();
  window.localStorage.setItem(INIT_KEY, "true");
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
  return demo;
}

function deadlineValue(task: Task) {
  return task.deadline ? new Date(`${task.deadline}T12:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
}

function compareTodo(a: Task, b: Task) {
  const deadlineDiff = deadlineValue(a) - deadlineValue(b);
  if (deadlineDiff !== 0) return deadlineDiff;
  const weight = { must: 0, should: 1, side: 2 };
  return weight[a.level] - weight[b.level] || a.createdAt.localeCompare(b.createdAt);
}

function compareDone(a: Task, b: Task) {
  return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
}

function formatDateLabel(iso: string | null) {
  if (!iso) return "No deadline";
  const today = isoToday();
  const tomorrow = isoToday(1);
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${iso}T12:00:00`));
}

function sectionLabel(task: Task, mode: ViewMode) {
  if (mode === "done") {
    return task.completedAt ? formatDateLabel(task.completedAt.slice(0, 10)).toUpperCase() : "COMPLETED";
  }
  if (!task.deadline) return "NO DEADLINE";
  const today = isoToday();
  const tomorrow = isoToday(1);
  if (task.deadline < today) return "OVERDUE";
  if (task.deadline === today) return `TODAY - ${formatShortDate(task.deadline)}`;
  if (task.deadline === tomorrow) return `TOMORROW - ${formatShortDate(task.deadline)}`;
  return formatDateLabel(task.deadline).toUpperCase();
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(
    new Date(`${iso}T12:00:00`),
  );
}

function groupTasks(tasks: Task[], mode: ViewMode) {
  const groups = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const label = sectionLabel(task, mode);
    groups.set(label, [...(groups.get(label) ?? []), task]);
  });
  return Array.from(groups.entries());
}

function draftToDeadline(draft: Draft) {
  if (draft.deadlineMode === "today") return isoToday();
  if (draft.deadlineMode === "tomorrow") return isoToday(1);
  if (draft.deadlineMode === "pick") return draft.pickedDate || null;
  return null;
}

function draftFromTask(task: Task): Draft {
  return {
    title: task.title,
    level: task.level,
    deadlineMode: task.deadline ? "pick" : "none",
    pickedDate: task.deadline ?? "",
  };
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewMode>("todo");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    setTasks(loadTasks());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    window.localStorage.setItem(INIT_KEY, "true");
  }, [tasks, ready]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (view === "todo" && task.completed) return false;
        if (view === "done" && !task.completed) return false;
        if (levelFilter !== "all" && task.level !== levelFilter) return false;
        return true;
      })
      .sort((a, b) => (view === "done" ? compareDone(a, b) : compareTodo(a, b)));
  }, [tasks, view, levelFilter]);

  const grouped = useMemo(() => groupTasks(filteredTasks, view), [filteredTasks, view]);
  const openTasks = tasks.filter((task) => !task.completed);
  const mustOpen = openTasks.filter((task) => task.level === "must").length;
  const dueToday = openTasks.filter((task) => task.deadline === isoToday()).length;
  const dueTomorrow = openTasks.filter((task) => task.deadline === isoToday(1)).length;
  const completedThisWeek = tasks.filter((task) => {
    if (!task.completedAt) return false;
    const completed = new Date(task.completedAt);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return completed >= weekAgo;
  }).length;

  const status =
    mustOpen === 0
      ? "Must-do cleared"
      : [
          `${mustOpen} must-do`,
          dueToday ? `${dueToday} due today` : "",
          dueTomorrow ? `${dueTomorrow} due tomorrow` : "",
        ]
          .filter(Boolean)
          .join(" - ");

  function openAddPanel() {
    setEditingId(null);
    setDraft({ ...emptyDraft, pickedDate: isoToday(1) });
    setPanelOpen(true);
  }

  function openEditPanel(task: Task) {
    setEditingId(task.id);
    setDraft(draftFromTask(task));
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    const deadline = draftToDeadline(draft);

    if (editingId) {
      setTasks((current) =>
        current.map((task) =>
          task.id === editingId
            ? {
                ...task,
                title,
                level: draft.level,
                deadline,
              }
            : task,
        ),
      );
    } else {
      setTasks((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          title,
          level: draft.level,
          deadline,
          completed: false,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);
    }

    closePanel();
  }

  function toggleTask(task: Task) {
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              completed: !item.completed,
              completedAt: item.completed ? null : new Date().toISOString(),
            }
          : item,
      ),
    );
  }

  function deleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    setTasks((current) => current.filter((item) => item.id !== task.id));
  }

  return (
    <main className="mission-shell">
      <aside className="mission-sidebar" aria-label="Mission navigation">
        <div>
          <div className="profile-dot">SX</div>
          <h1>MISSION CONTROL</h1>
          <p className="status-line">{status}</p>
        </div>

        <nav className="view-tabs" aria-label="Task views">
          {(["todo", "done", "all"] as ViewMode[]).map((item) => (
            <button
              className={view === item ? "active" : ""}
              key={item}
              onClick={() => setView(item)}
              type="button"
            >
              {item.toUpperCase()}
            </button>
          ))}
        </nav>

        <div className="sidebar-stats">
          <span>{openTasks.length} open</span>
          <span>{completedThisWeek} done this week</span>
        </div>
      </aside>

      <section className="mission-board">
        <header className="board-top">
          <div>
            <p className="eyebrow">Personal assignment dashboard</p>
            <h2>{view === "done" ? "Completed history" : view === "all" ? "All missions" : "Current missions"}</h2>
          </div>
          <button className="primary-add" onClick={openAddPanel} type="button">
            <span aria-hidden="true">+</span>
            Add Task
          </button>
        </header>

        <div className="level-filter" aria-label="Level filter">
          {(["all", "must", "should", "side"] as LevelFilter[]).map((level) => (
            <button
              className={levelFilter === level ? "active" : ""}
              key={level}
              onClick={() => setLevelFilter(level)}
              type="button"
            >
              {level === "all" ? "All" : levelMeta[level].label}
            </button>
          ))}
        </div>

        <div className="task-list">
          {grouped.length === 0 ? (
            <div className="empty-state">
              <span>{view === "done" ? "✓" : "•"}</span>
              <h3>{view === "done" ? "No completed missions yet" : "Clear skies here"}</h3>
              <p>
                {view === "done"
                  ? "Finished assignments will collect here with their original level and deadline."
                  : "Add a mission when something needs your attention, or switch filters to see more."}
              </p>
            </div>
          ) : (
            grouped.map(([label, items]) => (
              <section className="task-group" key={label}>
                <h3>{label}</h3>
                {items.map((task) => (
                  <article className={`task-card ${task.level} ${task.completed ? "complete" : ""}`} key={task.id}>
                    <button
                      aria-label={task.completed ? "Restore task" : "Complete task"}
                      className="check-button"
                      onClick={() => toggleTask(task)}
                      type="button"
                    >
                      {task.completed ? "✓" : ""}
                    </button>
                    <div className="task-main">
                      <div className="task-title-row">
                        <span className="level-mark">{levelMeta[task.level].mark}</span>
                        <h4>{task.title}</h4>
                      </div>
                      <p>
                        <span>{levelMeta[task.level].label}</span>
                        <span>{formatDateLabel(task.deadline)}</span>
                        {task.completedAt ? <span>Done {formatDateLabel(task.completedAt.slice(0, 10))}</span> : null}
                      </p>
                    </div>
                    <div className="task-actions">
                      <button onClick={() => openEditPanel(task)} type="button">
                        Edit
                      </button>
                      <button onClick={() => deleteTask(task)} type="button">
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            ))
          )}
        </div>
      </section>

      <button className="floating-add" onClick={openAddPanel} type="button" aria-label="Add task">
        +
      </button>

      {panelOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closePanel}>
          <form className="task-panel" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveTask}>
            <div className="panel-head">
              <h3>{editingId ? "Edit Task" : "Add Task"}</h3>
              <button aria-label="Close panel" onClick={closePanel} type="button">
                ×
              </button>
            </div>

            <label className="field">
              <span>Task name</span>
              <input
                autoFocus
                maxLength={120}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Physics quiz"
                required
                value={draft.title}
              />
            </label>

            <div className="field">
              <span>Level</span>
              <div className="choice-grid">
                {(["must", "should", "side"] as TaskLevel[]).map((level) => (
                  <button
                    className={draft.level === level ? "active" : ""}
                    key={level}
                    onClick={() => setDraft((current) => ({ ...current, level }))}
                    type="button"
                  >
                    {levelMeta[level].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Deadline</span>
              <div className="choice-grid deadline-grid">
                {[
                  ["today", "Today"],
                  ["tomorrow", "Tomorrow"],
                  ["pick", "Pick Date"],
                  ["none", "No Deadline"],
                ].map(([mode, label]) => (
                  <button
                    className={draft.deadlineMode === mode ? "active" : ""}
                    key={mode}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        deadlineMode: mode as Draft["deadlineMode"],
                        pickedDate: mode === "today" ? isoToday() : mode === "tomorrow" ? isoToday(1) : current.pickedDate,
                      }))
                    }
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              {draft.deadlineMode === "pick" ? (
                <input
                  className="date-input"
                  onChange={(event) => setDraft((current) => ({ ...current, pickedDate: event.target.value }))}
                  type="date"
                  value={draft.pickedDate}
                />
              ) : null}
            </div>

            <button className="submit-task" type="submit">
              {editingId ? "Save Changes" : "Add Task"}
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
