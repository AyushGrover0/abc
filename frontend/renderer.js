const STORAGE_KEY = "taskpilot-ai-state-v1";
const THEME_KEY = "taskpilot-ai-theme";
const API_BASE_URL = (window.TASKPILOT_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");

const demoTasks = [
  {
    id: crypto.randomUUID(),
    title: "Design portfolio hero section",
    description: "Refine headline, social proof, and primary call-to-action for the homepage refresh.",
    project: "Portfolio Website",
    dueDate: addDays(2),
    priority: "high",
    effort: "moderate",
    status: "doing",
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    title: "Ship AI task manager case study",
    description: "Document product goals, design decisions, and measurable impact for the portfolio write-up.",
    project: "TaskPilot AI",
    dueDate: addDays(5),
    priority: "high",
    effort: "deep",
    status: "todo",
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    title: "Record demo walkthrough",
    description: "Capture a 60-second video of the dashboard, task flows, and AI briefing interactions.",
    project: "Launch Assets",
    dueDate: addDays(1),
    priority: "medium",
    effort: "quick",
    status: "todo",
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    title: "Polish responsive task cards",
    description: "Tighten spacing and improve mobile readability for kanban cards and summaries.",
    project: "TaskPilot AI",
    dueDate: addDays(-1),
    priority: "medium",
    effort: "moderate",
    status: "doing",
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    title: "Publish Dribbble shots",
    description: "Export mockups and publish a small visual story from the project exploration.",
    project: "Design Presence",
    dueDate: addDays(6),
    priority: "low",
    effort: "quick",
    status: "done",
    createdAt: new Date().toISOString()
  }
];

const state = {
  tasks: [],
  theme: "light",
  remoteBriefing: null,
  apiStatus: "offline",
  filters: {
    search: "",
    status: "all",
    priority: "all"
  }
};

function $(selector) {
  return document.querySelector(selector);
}

function addDays(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateString) {
  if (!dateString) {
    return "No deadline";
  }

  return new Date(`${dateString}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function daysUntil(dateString) {
  if (!dateString) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function priorityWeight(priority) {
  return { high: 3, medium: 2, low: 1 }[priority] || 1;
}

function effortWeight(effort) {
  return { quick: 1, moderate: 2, deep: 3 }[effort] || 1;
}

function statusLabel(status) {
  return {
    todo: "To do",
    doing: "In progress",
    done: "Completed"
  }[status] || status;
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

function openSidebar() {
  document.body.classList.add("sidebar-open");
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.tasks = [];
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch {
    state.tasks = [];
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      tasks: state.tasks
    })
  );
}

function loadTheme() {
  const storedTheme = localStorage.getItem(THEME_KEY);
  state.theme = storedTheme === "dark" ? "dark" : "light";
}

function saveTheme() {
  localStorage.setItem(THEME_KEY, state.theme);
}

function applyTheme() {
  document.body.dataset.theme = state.theme;
  $("#theme-toggle-label").textContent = state.theme === "dark" ? "Light mode" : "Dark mode";
}

function hideIntro() {
  window.setTimeout(() => {
    document.body.classList.add("intro-hidden");
  }, 1400);
}

function scoreTask(task) {
  const dueDelta = daysUntil(task.dueDate);
  const dueScore = dueDelta === null ? 0 : dueDelta < 0 ? 5 : dueDelta <= 2 ? 4 : dueDelta <= 7 ? 2 : 1;
  const progressScore = task.status === "doing" ? 2 : task.status === "todo" ? 1 : -2;
  return priorityWeight(task.priority) * 2 + effortWeight(task.effort) + dueScore + progressScore;
}

function filteredTasks() {
  return state.tasks.filter((task) => {
    const searchTarget = `${task.title} ${task.project} ${task.description}`.toLowerCase();
    const matchesSearch = !state.filters.search || searchTarget.includes(state.filters.search.toLowerCase());
    const matchesStatus = state.filters.status === "all" || task.status === state.filters.status;
    const matchesPriority = state.filters.priority === "all" || task.priority === state.filters.priority;
    return matchesSearch && matchesStatus && matchesPriority;
  });
}

function computeProjects(tasks) {
  const map = new Map();
  tasks.forEach((task) => {
    const key = task.project?.trim() || "Unassigned";
    const existing = map.get(key) || { name: key, total: 0, done: 0, urgent: 0 };
    existing.total += 1;
    if (task.status === "done") {
      existing.done += 1;
    }
    if (task.priority === "high" && task.status !== "done") {
      existing.urgent += 1;
    }
    map.set(key, existing);
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total || b.urgent - a.urgent);
}

function getInsights(tasks) {
  const openTasks = tasks.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => {
    const delta = daysUntil(task.dueDate);
    return delta !== null && delta < 0;
  });
  const dueSoon = openTasks.filter((task) => {
    const delta = daysUntil(task.dueDate);
    return delta !== null && delta >= 0 && delta <= 7;
  });
  const deepWork = openTasks.filter((task) => task.effort === "deep");
  const focusScore = Math.max(28, Math.min(98, 92 - overdueTasks.length * 10 - deepWork.length * 4 - openTasks.length * 2));

  const lead = overdueTasks.length > 0
    ? `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}. Clear those first to reduce risk.`
    : dueSoon.length > 0
      ? `${dueSoon.length} task${dueSoon.length > 1 ? "s are" : " is"} due this week. Protect calendar space for delivery.`
      : openTasks.length > 0
        ? "Your board is healthy. Keep momentum by finishing the shortest high-value task next."
        : "The board is clear. This is a good moment to plan the next milestone.";

  const actions = [];
  const ranked = [...openTasks].sort((a, b) => scoreTask(b) - scoreTask(a));
  if (ranked[0]) {
    actions.push(`Start with "${ranked[0].title}" because it carries the highest urgency score.`);
  }
  if (deepWork.length > 0) {
    actions.push(`Reserve a focused block for ${deepWork.length} deep-work item${deepWork.length > 1 ? "s" : ""}.`);
  }
  if (openTasks.filter((task) => task.priority === "high").length > 2) {
    actions.push("Your backlog has too many high-priority items. Reclassify at least one to keep the board credible.");
  }
  if (actions.length === 0) {
    actions.push("Add a few upcoming tasks so the planner can create stronger recommendations.");
  }

  return {
    focusScore,
    lead,
    actions: actions.slice(0, 3),
    rankedPlan: ranked.slice(0, 4).map((task, index) => ({
      rank: index + 1,
      id: task.id,
      title: task.title,
      project: task.project || "Unassigned",
      dueDate: task.dueDate,
      dueLabel: formatDate(task.dueDate),
      priority: task.priority,
      score: scoreTask(task)
    }))
  };
}

async function requestJson(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("API base URL is not configured.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}.`);
  }

  return response.json();
}

async function refreshApiBriefing() {
  if (!API_BASE_URL) {
    state.remoteBriefing = null;
    state.apiStatus = "offline";
    renderBriefing(state.tasks);
    renderTodayPlan(state.tasks);
    return;
  }

  try {
    const payload = await requestJson("/api/briefing", {
      method: "POST",
      body: JSON.stringify({ tasks: state.tasks })
    });
    state.remoteBriefing = payload.insights || null;
    state.apiStatus = "online";
  } catch {
    state.remoteBriefing = null;
    state.apiStatus = "offline";
  }

  renderBriefing(state.tasks);
  renderTodayPlan(state.tasks);
}

function renderStats(tasks) {
  const dueThisWeek = tasks.filter((task) => {
    const delta = daysUntil(task.dueDate);
    return delta !== null && delta >= 0 && delta <= 7 && task.status !== "done";
  }).length;
  const completed = tasks.filter((task) => task.status === "done").length;
  const overdue = tasks.filter((task) => {
    const delta = daysUntil(task.dueDate);
    return delta !== null && delta < 0 && task.status !== "done";
  }).length;
  const insights = state.remoteBriefing || getInsights(tasks);

  $("#focus-score").textContent = String(insights.focusScore);
  $("#focus-copy").textContent = insights.lead;
  $("#due-this-week").textContent = String(dueThisWeek);
  $("#completed-count").textContent = String(completed);
  $("#overdue-count").textContent = String(overdue);
}

function renderProjects(tasks) {
  const projects = computeProjects(tasks);
  const root = $("#project-list");
  root.innerHTML = "";
  $("#project-count-pill").textContent = `${projects.length} active`;

  if (projects.length === 0) {
    root.innerHTML = '<div class="empty-state">Projects appear here once you add tasks.</div>';
    return;
  }

  projects.forEach((project) => {
    const item = document.createElement("div");
    item.className = "project-row";
    item.innerHTML = `
      <div>
        <strong>${project.name}</strong>
        <div class="project-meta">${project.done}/${project.total} done · ${project.urgent} urgent</div>
      </div>
      <span class="pill">${Math.round((project.done / project.total) * 100) || 0}%</span>
    `;
    root.appendChild(item);
  });
}

function renderBriefing(tasks) {
  const insights = state.remoteBriefing || getInsights(tasks);
  const sourceLabel = state.apiStatus === "online" ? "Live API insight" : "Local insight";

  $("#briefing-card").innerHTML = `
    <div>
      <h3>${insights.lead}</h3>
      <p class="briefing-copy">${sourceLabel}: TaskPilot AI ranks your backlog by due pressure, effort load, and progress state to suggest the most sensible next move.</p>
    </div>
  `;

  const actionsRoot = $("#next-actions");
  actionsRoot.innerHTML = "";
  insights.actions.forEach((action, index) => {
    const item = document.createElement("div");
    item.className = "next-action";
    item.innerHTML = `<strong>Next action ${index + 1}</strong><p class="plan-copy">${action}</p>`;
    actionsRoot.appendChild(item);
  });
}

function renderTodayPlan(tasks) {
  const openTasks = state.remoteBriefing?.rankedPlan
    ? state.remoteBriefing.rankedPlan
    : tasks.filter((task) => task.status !== "done").sort((a, b) => scoreTask(b) - scoreTask(a)).slice(0, 4);
  const root = $("#today-plan");
  root.innerHTML = "";
  $("#today-plan-pill").textContent = `${openTasks.length} tasks`;

  if (openTasks.length === 0) {
    root.innerHTML = '<div class="empty-state">Nothing urgent. Load demo data or add a few tasks to generate a plan.</div>';
    return;
  }

  openTasks.forEach((task, index) => {
    const row = document.createElement("div");
    row.className = "plan-row";
    row.innerHTML = `
      <div>
        <strong>${task.rank || index + 1}. ${task.title}</strong>
        <div class="plan-copy">${task.project || "Unassigned"} · ${task.dueLabel || formatDate(task.dueDate)}</div>
      </div>
      <span class="priority-badge" data-priority="${task.priority}">${task.priority}</span>
    `;
    root.appendChild(row);
  });
}

function taskCard(task) {
  const delta = daysUntil(task.dueDate);
  const dueCopy = delta === null ? "No deadline" : delta < 0 ? `${Math.abs(delta)}d overdue` : delta === 0 ? "Due today" : `${delta}d left`;
  const overdueClass = delta !== null && delta < 0 && task.status !== "done" ? "overdue" : "";

  return `
    <article class="task-card ${overdueClass}">
      <div>
        <h3>${task.title}</h3>
        <p class="task-description">${task.description || "No extra notes yet."}</p>
      </div>
      <div class="task-meta">
        <span class="priority-badge" data-priority="${task.priority}">${task.priority}</span>
        <span class="effort-badge">${task.effort}</span>
        <span class="status-badge">${task.project || "Unassigned"}</span>
        <span class="meta-chip">${dueCopy}</span>
      </div>
      <div class="task-actions">
        <button class="status-button" type="button" data-action="cycle" data-id="${task.id}">Move stage</button>
        <button class="delete-button" type="button" data-action="delete" data-id="${task.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderColumns(tasks) {
  const buckets = {
    todo: tasks.filter((task) => task.status === "todo").sort((a, b) => scoreTask(b) - scoreTask(a)),
    doing: tasks.filter((task) => task.status === "doing").sort((a, b) => scoreTask(b) - scoreTask(a)),
    done: tasks.filter((task) => task.status === "done").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  };

  ["todo", "doing", "done"].forEach((status) => {
    const root = $(`#${status}-column`);
    root.innerHTML = buckets[status].length
      ? buckets[status].map(taskCard).join("")
      : `<div class="empty-state">No ${statusLabel(status).toLowerCase()} tasks here.</div>`;
    $(`#${status}-count`).textContent = String(buckets[status].length);
  });
}

function renderSummary(tasks) {
  $("#task-count-pill").textContent = `${tasks.length} tasks`;
  renderStats(tasks);
  renderProjects(tasks);
  renderBriefing(tasks);
  renderTodayPlan(tasks);
  renderColumns(filteredTasks());
}

function renderAll() {
  applyTheme();
  renderSummary(state.tasks);
}

function resetForm() {
  $("#task-form").reset();
  $("#task-priority").value = "medium";
  $("#task-effort").value = "moderate";
}

function addTask(event) {
  event.preventDefault();

  const task = {
    id: crypto.randomUUID(),
    title: $("#task-title").value.trim(),
    description: $("#task-description").value.trim(),
    project: $("#task-project").value.trim(),
    dueDate: $("#task-due-date").value,
    priority: $("#task-priority").value,
    effort: $("#task-effort").value,
    status: "todo",
    createdAt: new Date().toISOString()
  };

  if (!task.title) {
    return;
  }

  state.tasks.unshift(task);
  saveState();
  renderAll();
  refreshApiBriefing();
  resetForm();
  closeSidebar();
}

function cycleStatus(taskId) {
  const order = ["todo", "doing", "done"];
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  task.status = order[(order.indexOf(task.status) + 1) % order.length];
  saveState();
  renderAll();
  refreshApiBriefing();
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  saveState();
  renderAll();
  refreshApiBriefing();
}

function attachEvents() {
  $("#task-form").addEventListener("submit", addTask);

  $("#theme-toggle").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    saveTheme();
    applyTheme();
  });

  $("#open-sidebar").addEventListener("click", openSidebar);
  $("#close-sidebar").addEventListener("click", closeSidebar);
  $("#mobile-overlay").addEventListener("click", closeSidebar);

  $("#search-input").addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim();
    renderAll();
  });

  $("#status-filter").addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderAll();
  });

  $("#priority-filter").addEventListener("change", (event) => {
    state.filters.priority = event.target.value;
    renderAll();
  });

  $("#seed-demo").addEventListener("click", () => {
    const applyDemoTasks = (tasks) => {
      state.tasks = tasks;
      saveState();
      renderAll();
      refreshApiBriefing();
      closeSidebar();
    };

    if (!API_BASE_URL) {
      applyDemoTasks(structuredClone(demoTasks));
      return;
    }

    requestJson("/api/demo-tasks")
      .then((payload) => {
        applyDemoTasks(Array.isArray(payload.tasks) ? payload.tasks : structuredClone(demoTasks));
      })
      .catch(() => {
        applyDemoTasks(structuredClone(demoTasks));
      });
  });

  $("#clear-all").addEventListener("click", () => {
    state.tasks = [];
    saveState();
    renderAll();
    refreshApiBriefing();
    closeSidebar();
  });

  $("#refresh-briefing").addEventListener("click", () => {
    refreshApiBriefing();
  });

  document.body.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const { action, id } = actionTarget.dataset;
    if (action === "cycle") {
      cycleStatus(id);
    }
    if (action === "delete") {
      deleteTask(id);
    }
  });
}

function bootstrap() {
  loadState();
  loadTheme();
  attachEvents();
  renderAll();
  refreshApiBriefing();
  hideIntro();
}

bootstrap();
