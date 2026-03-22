const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function addDays(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

const cors = require('cors');
app.use(cors({
  origin: '*'
}));

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

function scoreTask(task) {
  const dueDelta = daysUntil(task.dueDate);
  const dueScore = dueDelta === null ? 0 : dueDelta < 0 ? 5 : dueDelta <= 2 ? 4 : dueDelta <= 7 ? 2 : 1;
  const progressScore = task.status === "doing" ? 2 : task.status === "todo" ? 1 : -2;
  return priorityWeight(task.priority) * 2 + effortWeight(task.effort) + dueScore + progressScore;
}

function formatDate(dateString) {
  if (!dateString) {
    return "No deadline";
  }

  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function demoTasks() {
  return [
    {
      id: "demo-1",
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
      id: "demo-2",
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
      id: "demo-3",
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
      id: "demo-4",
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
      id: "demo-5",
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
}

function computeProjects(tasks) {
  const map = new Map();
  tasks.forEach((task) => {
    const key = task.project && task.project.trim() ? task.project.trim() : "Unassigned";
    const current = map.get(key) || { name: key, total: 0, done: 0, urgent: 0 };
    current.total += 1;
    if (task.status === "done") {
      current.done += 1;
    }
    if (task.priority === "high" && task.status !== "done") {
      current.urgent += 1;
    }
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total || b.urgent - a.urgent);
}

function buildInsights(tasks) {
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

  const ranked = [...openTasks].sort((a, b) => scoreTask(b) - scoreTask(a));
  const actions = [];
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
    })),
    projects: computeProjects(tasks)
  };
}

function getStats(tasks) {
  return {
    dueThisWeek: tasks.filter((task) => {
      const delta = daysUntil(task.dueDate);
      return delta !== null && delta >= 0 && delta <= 7 && task.status !== "done";
    }).length,
    completed: tasks.filter((task) => task.status === "done").length,
    overdue: tasks.filter((task) => {
      const delta = daysUntil(task.dueDate);
      return delta !== null && delta < 0 && task.status !== "done";
    }).length
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON payload."));
      }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    sendJson(response, 200, {
      ok: true,
      service: "TaskPilot AI API",
      endpoints: ["/api/health", "/api/demo-tasks", "/api/briefing"]
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      status: "healthy",
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/demo-tasks") {
    sendJson(response, 200, {
      ok: true,
      tasks: demoTasks()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/briefing") {
    try {
      const payload = await parseRequestBody(request);
      const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      sendJson(response, 200, {
        ok: true,
        insights: buildInsights(tasks),
        stats: getStats(tasks)
      });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error.message || "Unable to process the request."
      });
    }
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "Route not found."
  });
});

server.listen(PORT, () => {
  console.log(`TaskPilot AI API listening on port ${PORT}`);
});
