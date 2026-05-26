import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "db.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PORT = process.env.PORT || 4000;
const ADMIN_EMAIL = "sahilisthebest885@gmail.com";
const ADMIN_PASSWORD = "sahil@885";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST", "PATCH", "DELETE"] }
});

app.use(cors());
app.use(express.json({ limit: "5mb" }));

function decodeHeader(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function safeFileName(fileName) {
  const parsed = path.parse(String(fileName || "upload.bin"));
  const name = parsed.name.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").slice(0, 60) || "upload";
  const ext = parsed.ext.replace(/[^a-z0-9.]/gi, "").slice(0, 12) || ".bin";
  return `${name}${ext}`;
}

function contentDispositionName(fileName) {
  return String(fileName || "resource").replace(/["\r\n]/g, "");
}

async function saveUpload(req, folder) {
  const title = decodeHeader(req.get("x-title")).trim();
  const originalName = decodeHeader(req.get("x-file-name")).trim();
  const mimeType = String(req.get("content-type") || "application/octet-stream").split(";")[0];

  if (!title) throw Object.assign(new Error("Title is required."), { status: 400 });
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw Object.assign(new Error("Choose a file to upload."), { status: 400 });

  const id = nanoid();
  const fileName = `${id}-${safeFileName(originalName)}`;
  const targetDir = path.join(UPLOAD_DIR, folder);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, fileName), req.body);

  return {
    id,
    title,
    fileName: originalName || fileName,
    fileUrl: `/uploads/${folder}/${fileName}`,
    mimeType
  };
}

app.get("/uploads/:folder/:fileName", async (req, res) => {
  const folder = String(req.params.folder || "").replace(/[^a-z0-9_-]/gi, "");
  const fileName = path.basename(String(req.params.fileName || ""));
  const folderPath = path.join(UPLOAD_DIR, folder);
  const filePath = path.join(folderPath, fileName);
  if (!filePath.startsWith(folderPath)) return res.status(400).end();
  res.setHeader("Content-Disposition", `inline; filename="${contentDispositionName(fileName)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) res.status(error.statusCode || 404).json({ error: "Uploaded file not found." });
  });
});

app.get("/", (_req, res) => {
  res.redirect("http://localhost:5173");
});

const now = () => new Date().toISOString();
const makeToken = () => nanoid(32);
const makeJoinCode = () => nanoid(6).toUpperCase();

const makeSemesters = () =>
  Array.from({ length: 8 }, (_, index) => ({
    id: nanoid(),
    number: index + 1,
    subjects: []
  }));

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  provider: user.provider,
  googleVerified: Boolean(user.googleVerified)
});

async function readDb() {
  const raw = await fs.readFile(DB_PATH, "utf8");
  const db = JSON.parse(raw);
  db.departments ||= [];
  db.workspaces ||= [];
  db.messages ||= [];
  db.notes ||= [];
  db.tasks ||= [];
  db.sessions ||= [];
  db.users ||= [];

  if (!db.users.some((user) => user.email === ADMIN_EMAIL)) {
    db.users.push({
      id: nanoid(),
      name: "Sahil Admin",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
      provider: "google",
      googleVerified: true,
      token: makeToken(),
      createdAt: now()
    });
  }

  if (!db.departments.length) {
    db.departments = ["Software Engineering", "Computer Science"].map((name) => ({
      id: nanoid(),
      name,
      createdAt: now(),
      createdBy: ADMIN_EMAIL,
      semesters: makeSemesters()
    }));
  }

  db.departments.forEach((department) => {
    department.semesters ||= makeSemesters();
    department.semesters.forEach((semester) => {
      semester.subjects ||= [];
      semester.subjects.forEach((subject) => {
        subject.papers ||= { midterm: [], finals: [] };
        subject.papers.midterm ||= [];
        subject.papers.finals ||= [];
        subject.notes ||= [];
        subject.videos ||= [];
      });
    });
  });

  db.workspaces.forEach((workspace) => {
    workspace.joinCode ||= makeJoinCode();
    workspace.members = Array.isArray(workspace.members) ? workspace.members : [];
  });

  db.sessions.forEach((session) => {
    session.meetingCode ||= makeJoinCode();
    session.attendees = Array.isArray(session.attendees) ? session.attendees : [];
    session.workspaceId ||= "global";
  });

  await writeDb(db);
  return db;
}

async function writeDb(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
  return db;
}

function findUser(db, req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.body?.token;
  return db.users.find((user) => user.token === token);
}

async function requireUser(req, res, next) {
  const db = await readDb();
  const user = findUser(db, req);
  if (!user) return res.status(401).json({ error: "Login required." });
  req.db = db;
  req.user = user;
  next();
}

async function requireAdmin(req, res, next) {
  await requireUser(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
    next();
  });
}

function findSemester(db, departmentId, semesterId) {
  const department = db.departments.find((item) => item.id === departmentId);
  if (!department) return {};
  const semester = department.semesters.find((item) => item.id === semesterId);
  return { department, semester };
}

function findSubject(db, subjectId) {
  return db.departments.flatMap((department) => department.semesters).flatMap((semester) => semester.subjects).find((subject) => subject.id === subjectId);
}

async function deleteUploadedFile(item) {
  if (!item?.fileUrl?.startsWith("/uploads/")) return;
  const filePath = path.join(__dirname, item.fileUrl);
  if (!filePath.startsWith(UPLOAD_DIR)) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function canManageResource(user, item, subject) {
  return user.role === "admin" || item.addedByEmail === user.email || subject.createdBy === user.email;
}

async function callGemini(text) {
  if (!process.env.GEMINI_API_KEY) return null;

  const prompt = `Create a concise study summary, 5 flashcards, and a 3-step revision plan from these notes. Return JSON with summary, flashcards [{question, answer}], and plan array.\n\n${text}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  if (!response.ok) throw new Error("Gemini request failed.");
  const payload = await response.json();
  const output = payload.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonText = output.replace(/```json|```/g, "").trim();
  return JSON.parse(jsonText);
}

function extractJsonObject(output) {
  const cleaned = output.replace(/```json|```/g, "").trim();
  const first = cleaned.indexOf("{");
  if (first === -1) return cleaned;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = first; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") inString = !inString;
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return cleaned.slice(first, index + 1);
  }

  return cleaned;
}

function normalizeAiResult(parsed, provider) {
  return {
    provider,
    summary: String(parsed.summary || parsed.answer || "No answer returned.").trim(),
    flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards.map((card) => ({
      question: String(card.question || "").trim(),
      answer: String(card.answer || "").trim()
    })).filter((card) => card.question && card.answer) : [],
    plan: Array.isArray(parsed.plan) ? parsed.plan.map((step) => String(step).trim()).filter(Boolean) : []
  };
}

function parseAiJson(output, provider) {
  const jsonText = extractJsonObject(output);
  try {
    const parsed = JSON.parse(jsonText);
    return normalizeAiResult(parsed, provider);
  } catch {
    return {
      provider,
      summary: output.trim(),
      flashcards: [],
      plan: ["Read the answer", "Write one example", "Practice one related question"]
    };
  }
}

async function callPollinations(text) {
  const prompt = `You are an AI learning assistant for university students.
Answer the student's question directly and specifically. Do not repeat the question as the answer.
If the input is notes, summarize them and extract learning points.
Use your own reasoning and examples. Do not use a template.
Return valid JSON only. No markdown, no ads, no extra text.
JSON shape:
{
  "summary": "direct helpful answer or summary",
  "flashcards": [{"question": "question", "answer": "answer"}],
  "plan": ["step 1", "step 2", "step 3"]
}

Student input:
${text}`;

  const response = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.POLLINATIONS_MODEL || "openai",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      private: true
    })
  });

  if (!response.ok) throw new Error("Pollinations request failed.");
  const payload = await response.json();
  const output = payload.choices?.[0]?.message?.content || "";
  return parseAiJson(output, "Pollinations AI API");
}

async function callPollinationsText(text) {
  const prompt = `Answer this as a helpful AI tutor. Give a direct answer, then 3 useful bullet points, then 2 flashcard Q&A pairs. Do not repeat the prompt as the answer.\n\nStudent: ${text}`;
  const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&private=true`);
  if (!response.ok) throw new Error("Pollinations text request failed.");
  const output = await response.text();
  return {
    provider: "Pollinations AI Text API",
    summary: output.trim(),
    flashcards: [],
    plan: []
  };
}

app.get("/api/bootstrap", async (req, res) => {
  const db = await readDb();
  const user = findUser(db, req);
  const workspaces = user
    ? db.workspaces.filter((workspace) => workspace.members?.some((member) => member.email === user.email) || workspace.createdBy === user.email || user.role === "admin")
    : [];
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const sessions = user
    ? db.sessions.filter((session) => {
        const isPersonal = !session.workspaceId || session.workspaceId === "global";
        const belongsToUser = session.hostEmail === user.email || session.attendees?.some((attendee) => attendee.email === user.email);
        return isPersonal ? belongsToUser : workspaceIds.has(session.workspaceId);
      })
    : [];
  res.json({
    ...db,
    workspaces,
    messages: user ? db.messages.filter((message) => workspaceIds.has(message.workspaceId)) : [],
    tasks: user ? db.tasks.filter((task) => task.ownerEmail === user.email) : [],
    sessions,
    users: db.users.map(publicUser),
    currentUser: user ? publicUser(user) : null
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const db = await readDb();
  const user = db.users.find((item) => item.email === email && item.password === password);

  if (!user) return res.status(401).json({ error: "Invalid credentials." });
  user.token ||= makeToken();
  await writeDb(db);
  res.json({ token: user.token, user: publicUser(user) });
});

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const name = String(req.body.name || email.split("@")[0] || "Student").trim();
  if (!email.endsWith("@gmail.com")) return res.status(400).json({ error: "Use a Gmail address." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  const db = await readDb();
  if (db.users.some((user) => user.email === email)) return res.status(409).json({ error: "Account already exists." });
  const user = {
    id: nanoid(),
    name,
    email,
    password,
    role: email === ADMIN_EMAIL ? "admin" : "student",
    provider: "password",
    googleVerified: false,
    token: makeToken(),
    createdAt: now()
  };
  db.users.push(user);
  await writeDb(db);
  res.status(201).json({ token: user.token, user: publicUser(user) });
});

app.post("/api/auth/google", async (req, res) => {
  const credential = String(req.body.credential || "");
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
  if (!response.ok) return res.status(401).json({ error: "Google token could not be verified." });
  const profile = await response.json();
  if (!profile.email_verified || !String(profile.email).endsWith("@gmail.com")) {
    return res.status(401).json({ error: "Use a verified Google account." });
  }

  const db = await readDb();
  let user = db.users.find((item) => item.email === profile.email);
  if (!user) {
    user = {
      id: profile.sub || nanoid(),
      name: profile.name || profile.email.split("@")[0],
      email: profile.email,
      password: "",
      role: profile.email === ADMIN_EMAIL ? "admin" : "student",
      provider: "google",
      googleVerified: true,
      token: makeToken(),
      createdAt: now()
    };
    db.users.push(user);
  }
  user.googleVerified = true;
  user.provider = "google";
  user.token ||= makeToken();
  await writeDb(db);
  res.json({ token: user.token, user: publicUser(user) });
});

app.post("/api/departments", requireAdmin, async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Department name is required." });

  const department = { id: nanoid(), name, createdAt: now(), createdBy: req.user.email, semesters: makeSemesters() };
  req.db.departments.push(department);
  await writeDb(req.db);
  res.status(201).json(department);
});

app.post("/api/departments/:departmentId/semesters", requireAdmin, async (req, res) => {
  const department = req.db.departments.find((item) => item.id === req.params.departmentId);
  if (!department) return res.status(404).json({ error: "Department not found." });
  const nextNumber = Math.max(0, ...department.semesters.map((semester) => semester.number)) + 1;
  const semester = { id: nanoid(), number: nextNumber, subjects: [] };
  department.semesters.push(semester);
  await writeDb(req.db);
  res.status(201).json(semester);
});

app.delete("/api/departments/:departmentId/semesters/:semesterId", requireAdmin, async (req, res) => {
  const department = req.db.departments.find((item) => item.id === req.params.departmentId);
  if (!department) return res.status(404).json({ error: "Department not found." });
  department.semesters = department.semesters.filter((semester) => semester.id !== req.params.semesterId);
  await writeDb(req.db);
  res.json({ ok: true });
});

app.post("/api/departments/:departmentId/semesters/:semesterId/subjects", requireUser, async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Subject name is required." });

  const { semester } = findSemester(req.db, req.params.departmentId, req.params.semesterId);
  if (!semester) return res.status(404).json({ error: "Semester not found." });

  let subject = semester.subjects.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!subject) {
    subject = {
      id: nanoid(),
      name,
      createdAt: now(),
      createdBy: req.user.email,
      papers: { midterm: [], finals: [] },
      notes: [],
      videos: []
    };
    semester.subjects.push(subject);
  }
  await writeDb(req.db);
  res.status(201).json(subject);
});

app.delete("/api/departments/:departmentId/semesters/:semesterId/subjects/:subjectId", requireUser, async (req, res) => {
  const { semester } = findSemester(req.db, req.params.departmentId, req.params.semesterId);
  if (!semester) return res.status(404).json({ error: "Semester not found." });
  const subject = semester.subjects.find((item) => item.id === req.params.subjectId);
  if (!subject) return res.status(404).json({ error: "Study section not found." });
  if (req.user.role !== "admin" && subject.createdBy !== req.user.email) {
    return res.status(403).json({ error: "Only the creator or admin can delete this study section." });
  }
  semester.subjects = semester.subjects.filter((item) => item.id !== req.params.subjectId);
  await writeDb(req.db);
  res.json({ ok: true });
});

app.post("/api/subjects/:subjectId/papers", requireUser, async (req, res) => {
  const term = req.body.term === "finals" ? "finals" : "midterm";
  const title = String(req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Paper title is required." });

  const subject = findSubject(req.db, req.params.subjectId);
  if (!subject) return res.status(404).json({ error: "Subject not found." });

  const paper = {
    id: nanoid(),
    title,
    year: String(req.body.year || "").trim(),
    url: String(req.body.url || "").trim(),
    addedBy: req.user.name,
    addedByEmail: req.user.email,
    createdAt: now()
  };
  subject.papers[term].push(paper);
  await writeDb(req.db);
  res.status(201).json(paper);
});

app.post("/api/subjects/:subjectId/papers/upload", requireUser, express.raw({ type: "*/*", limit: "200mb" }), async (req, res) => {
  try {
    const term = req.query.term === "finals" ? "finals" : "midterm";
    const subject = findSubject(req.db, req.params.subjectId);
    if (!subject) return res.status(404).json({ error: "Subject not found." });

    const paper = {
      ...(await saveUpload(req, "papers")),
      addedBy: req.user.name,
      addedByEmail: req.user.email,
      createdAt: now()
    };
    subject.papers[term].push(paper);
    await writeDb(req.db);
    res.status(201).json(paper);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Upload failed." });
  }
});

app.delete("/api/subjects/:subjectId/papers/:term/:paperId", requireUser, async (req, res) => {
  const term = req.params.term === "finals" ? "finals" : "midterm";
  const subject = findSubject(req.db, req.params.subjectId);
  if (!subject) return res.status(404).json({ error: "Subject not found." });

  const paper = subject.papers[term]?.find((item) => item.id === req.params.paperId);
  if (!paper) return res.status(404).json({ error: "Paper not found." });
  if (!canManageResource(req.user, paper, subject)) {
    return res.status(403).json({ error: "Only the uploader, section creator, or admin can delete this paper." });
  }

  await deleteUploadedFile(paper);
  subject.papers[term] = subject.papers[term].filter((item) => item.id !== req.params.paperId);
  await writeDb(req.db);
  res.json({ ok: true });
});

app.post("/api/subjects/:subjectId/resources", requireUser, async (req, res) => {
  const type = req.body.type === "videos" ? "videos" : "notes";
  const title = String(req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Resource title is required." });

  const subject = findSubject(req.db, req.params.subjectId);
  if (!subject) return res.status(404).json({ error: "Subject not found." });

  const resource = {
    id: nanoid(),
    title,
    url: String(req.body.url || "").trim(),
    addedBy: req.user.name,
    addedByEmail: req.user.email,
    createdAt: now()
  };
  subject[type].push(resource);
  await writeDb(req.db);
  res.status(201).json(resource);
});

app.post("/api/subjects/:subjectId/resources/upload", requireUser, express.raw({ type: "*/*", limit: "200mb" }), async (req, res) => {
  try {
    const type = req.query.type === "videos" ? "videos" : "notes";
    const subject = findSubject(req.db, req.params.subjectId);
    if (!subject) return res.status(404).json({ error: "Subject not found." });

    const resource = {
      ...(await saveUpload(req, type)),
      addedBy: req.user.name,
      addedByEmail: req.user.email,
      createdAt: now()
    };
    subject[type].push(resource);
    await writeDb(req.db);
    res.status(201).json(resource);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Upload failed." });
  }
});

app.delete("/api/subjects/:subjectId/resources/:type/:resourceId", requireUser, async (req, res) => {
  const type = req.params.type === "videos" ? "videos" : "notes";
  const subject = findSubject(req.db, req.params.subjectId);
  if (!subject) return res.status(404).json({ error: "Subject not found." });

  const resource = subject[type]?.find((item) => item.id === req.params.resourceId);
  if (!resource) return res.status(404).json({ error: "Resource not found." });
  if (!canManageResource(req.user, resource, subject)) {
    return res.status(403).json({ error: "Only the uploader, section creator, or admin can delete this resource." });
  }

  await deleteUploadedFile(resource);
  subject[type] = subject[type].filter((item) => item.id !== req.params.resourceId);
  await writeDb(req.db);
  res.json({ ok: true });
});

app.post("/api/workspaces", requireUser, async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Workspace name is required." });

  const workspace = {
    id: nanoid(),
    joinCode: makeJoinCode(),
    name,
    community: String(req.body.community || "General Study Circle").trim(),
    members: [{ id: req.user.id, name: req.user.name, email: req.user.email, role: "owner" }],
    focus: String(req.body.focus || "Exam preparation").trim(),
    createdBy: req.user.email,
    createdAt: now()
  };
  req.db.workspaces.push(workspace);
  await writeDb(req.db);
  io.emit("workspace:created", workspace);
  res.status(201).json(workspace);
});

app.post("/api/workspaces/join", requireUser, async (req, res) => {
  const code = String(req.body.joinCode || "").trim().toUpperCase();
  const workspace = req.db.workspaces.find((item) => item.joinCode === code);
  if (!workspace) return res.status(404).json({ error: "Server code not found." });
  workspace.members ||= [];
  if (!workspace.members.some((member) => member.email === req.user.email)) {
    workspace.members.push({ id: req.user.id, name: req.user.name, email: req.user.email, role: "member" });
  }
  await writeDb(req.db);
  io.emit("workspace:created", workspace);
  res.json(workspace);
});

app.post("/api/workspaces/:id/leave", requireUser, async (req, res) => {
  const workspace = req.db.workspaces.find((item) => item.id === req.params.id);
  if (!workspace) return res.status(404).json({ error: "Server not found." });
  if (workspace.createdBy === req.user.email) {
    return res.status(400).json({ error: "Server owner cannot leave. Delete the server instead." });
  }

  workspace.members = (workspace.members || []).filter((member) => member.email !== req.user.email);
  req.db.sessions.forEach((session) => {
    if (session.workspaceId === workspace.id) {
      session.attendees = session.attendees?.filter((attendee) => attendee.email !== req.user.email) || [];
    }
  });
  await writeDb(req.db);
  io.emit("workspace:created", workspace);
  res.json({ ok: true });
});

app.delete("/api/workspaces/:id", requireUser, async (req, res) => {
  const workspace = req.db.workspaces.find((item) => item.id === req.params.id);
  if (!workspace) return res.status(404).json({ error: "Server not found." });
  if (req.user.role !== "admin" && workspace.createdBy !== req.user.email) {
    return res.status(403).json({ error: "Only the owner or admin can delete this server." });
  }
  req.db.workspaces = req.db.workspaces.filter((item) => item.id !== req.params.id);
  req.db.messages = req.db.messages.filter((message) => message.workspaceId !== req.params.id);
  req.db.sessions = req.db.sessions.filter((session) => session.workspaceId !== req.params.id);
  await writeDb(req.db);
  io.emit("workspace:created", {});
  res.json({ ok: true });
});

app.post("/api/messages", requireUser, async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Message is required." });

  const message = {
    id: nanoid(),
    workspaceId: req.body.workspaceId || "global",
    author: req.user.name,
    authorEmail: req.user.email,
    text,
    createdAt: now()
  };
  req.db.messages.push(message);
  await writeDb(req.db);
  io.emit("message:new", message);
  res.status(201).json(message);
});

app.post("/api/notes", requireUser, async (req, res) => {
  const note = {
    id: nanoid(),
    workspaceId: req.body.workspaceId || "global",
    title: String(req.body.title || "Shared study note").trim(),
    body: String(req.body.body || "").trim(),
    addedBy: req.user.name,
    addedByEmail: req.user.email,
    updatedAt: now()
  };
  req.db.notes.unshift(note);
  await writeDb(req.db);
  io.emit("note:updated", note);
  res.status(201).json(note);
});

app.post("/api/tasks", requireUser, async (req, res) => {
  const title = String(req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Task title is required." });

  const task = { id: nanoid(), title, owner: req.user.name, ownerEmail: req.user.email, done: false, createdAt: now() };
  req.db.tasks.unshift(task);
  await writeDb(req.db);
  io.emit("task:created", task);
  res.status(201).json(task);
});

app.patch("/api/tasks/:id", requireUser, async (req, res) => {
  const task = req.db.tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (task.ownerEmail !== req.user.email && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only the owner or admin can update this task." });
  }
  task.done = Boolean(req.body.done);
  await writeDb(req.db);
  io.emit("task:updated", task);
  res.json(task);
});

app.delete("/api/tasks/:id", requireUser, async (req, res) => {
  const task = req.db.tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (task.ownerEmail !== req.user.email && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only the owner or admin can delete this task." });
  }
  req.db.tasks = req.db.tasks.filter((item) => item.id !== req.params.id);
  await writeDb(req.db);
  io.emit("task:deleted", { id: req.params.id });
  res.json({ ok: true });
});

app.post("/api/sessions", requireUser, async (req, res) => {
  const session = {
    id: nanoid(),
    meetingCode: makeJoinCode(),
    workspaceId: req.body.workspaceId || "global",
    title: String(req.body.title || "Study session").trim(),
    startsAt: req.body.startsAt || now(),
    duration: Number(req.body.duration || 45),
    attendees: [{ id: req.user.id, name: req.user.name, email: req.user.email }],
    host: req.user.name,
    hostEmail: req.user.email,
    createdAt: now()
  };
  req.db.sessions.unshift(session);
  await writeDb(req.db);
  io.emit("session:created", session);
  res.status(201).json(session);
});

app.post("/api/sessions/join", requireUser, async (req, res) => {
  const code = String(req.body.meetingCode || "").trim().toUpperCase();
  const session = req.db.sessions.find((item) => item.meetingCode === code);
  if (!session) return res.status(404).json({ error: "Meeting code not found." });
  session.attendees ||= [];
  if (!session.attendees.some((attendee) => attendee.email === req.user.email)) {
    session.attendees.push({ id: req.user.id, name: req.user.name, email: req.user.email });
  }
  await writeDb(req.db);
  io.emit("session:created", session);
  res.json(session);
});

app.delete("/api/sessions/:id", requireUser, async (req, res) => {
  const session = req.db.sessions.find((item) => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (session.hostEmail === req.user.email || req.user.role === "admin") {
    req.db.sessions = req.db.sessions.filter((item) => item.id !== req.params.id);
  } else {
    session.attendees = session.attendees?.filter((attendee) => attendee.email !== req.user.email) || [];
  }
  await writeDb(req.db);
  io.emit("session:created", {});
  res.json({ ok: true });
});

app.post("/api/ai/suggest", requireUser, async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Paste notes first." });
  try {
    const result = await callGemini(text);
    if (result) return res.json({ provider: "Google Gemini API", ...result });
  } catch {
    // Fall through to the free no-key API below.
  }

  try {
    return res.json(await callPollinations(text));
  } catch {
    try {
      return res.json(await callPollinationsText(text));
    } catch {
      return res.status(503).json({
        error: "External AI service is unavailable. Set GEMINI_API_KEY or try again when internet access is working."
      });
    }
  }
});

io.on("connection", (socket) => {
  socket.emit("presence", { message: "Connected to live study collaboration." });
  socket.on("live:join", ({ meetingCode, user }) => {
    socket.join(meetingCode);
    socket.to(meetingCode).emit("live:participant", user);
  });
  socket.on("live:signal", ({ meetingCode, payload }) => {
    socket.to(meetingCode).emit("live:signal", payload);
  });
  socket.on("live:chat", ({ meetingCode, message }) => {
    io.to(meetingCode).emit("live:chat", message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`API and realtime server running on http://localhost:${PORT}`);
});
