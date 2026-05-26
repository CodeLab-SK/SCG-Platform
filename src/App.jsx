import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  BookOpen,
  Brain,
  CalendarClock,
  Camera,
  CheckCircle2,
  X,
  ClipboardList,
  Copy,
  FileText,
  FolderPlus,
  Library,
  LogIn,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Plus,
  ScreenShareOff,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Video,
  VideoOff,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import "./styles.css";

const API_URL = "http://localhost:4000";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

async function request(path, options = {}, token = localStorage.getItem("ssg_token")) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function uploadFile(path, { title, file }, token = localStorage.getItem("ssg_token")) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": file?.type || "application/octet-stream",
      "X-Title": encodeURIComponent(title || ""),
      "X-File-Name": encodeURIComponent(file?.name || "upload"),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: file
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Upload failed");
  return payload;
}

async function requestBlob(path, token = localStorage.getItem("ssg_token")) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed");
  }
  return response.blob();
}

const AI_DESTINATIONS = [
  ["ChatGPT", "https://chatgpt.com/"],
  ["Gemini", "https://gemini.google.com/"],
  ["Claude", "https://claude.ai/new"],
  ["Microsoft Copilot", "https://copilot.microsoft.com/"],
  ["Perplexity", "https://www.perplexity.ai/"],
  ["DeepSeek", "https://chat.deepseek.com/"],
  ["Grok", "https://grok.com/"]
];

function App() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [activeDepartmentId, setActiveDepartmentId] = useState("");
  const [activeSemesterId, setActiveSemesterId] = useState("");
  const [activeSubjectId, setActiveSubjectId] = useState("");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [messageFeed, setMessageFeed] = useState([]);
  const [aiResult, setAiResult] = useState(null);
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const snapshot = await request("/api/bootstrap");
      setData(snapshot);
      setCurrentUser(snapshot.currentUser);
      setActiveDepartmentId((current) => current || snapshot.departments[0]?.id || "");
      setActiveWorkspaceId((current) => current || snapshot.workspaces[0]?.id || "");
      setMessageFeed(snapshot.messages.slice(-8));
      setLoadError("");
    } catch (error) {
      setLoadError(error.message || "Could not connect to the backend API.");
    }
  };

  useEffect(() => {
    load();
    const socket = io(API_URL);
    socket.on("message:new", (message) => setMessageFeed((items) => [...items.slice(-7), message]));
    ["workspace:created", "note:updated", "task:created", "task:updated", "task:deleted", "session:created"].forEach((event) => socket.on(event, load));
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google || currentUser) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        const result = await request("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) }, "");
        localStorage.setItem("ssg_token", result.token);
        await load();
      }
    });
    window.google.accounts.id.renderButton(document.getElementById("google-login"), { theme: "outline", size: "large", width: 280 });
  }, [currentUser]);

  const activeDepartment = data?.departments.find((item) => item.id === activeDepartmentId);
  const activeSemester = activeDepartment?.semesters.find((item) => item.id === activeSemesterId) || activeDepartment?.semesters[0];
  const activeSubject = activeSemester?.subjects.find((item) => item.id === activeSubjectId) || activeSemester?.subjects[0];
  const activeWorkspace = data?.workspaces.find((item) => item.id === activeWorkspaceId);
  const workspaceMessages = messageFeed.filter((message) => message.workspaceId === (activeWorkspace?.id || "global"));
  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (activeSemester?.id) setActiveSemesterId(activeSemester.id);
  }, [activeDepartmentId, activeSemester?.id]);

  const productivity = useMemo(() => {
    if (!data) return { done: 0, total: 0, score: 0 };
    const done = data.tasks.filter((task) => task.done).length;
    const total = data.tasks.length || 1;
    return { done, total: data.tasks.length, score: Math.round((done / total) * 100) };
  }, [data]);

  const refreshAfter = async (promise, success = "Saved") => {
    try {
      await promise;
      setNotice(success);
      await load();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const logout = () => {
    localStorage.removeItem("ssg_token");
    setCurrentUser(null);
    load();
  };

  const leaveMeeting = () => setActiveMeeting(null);

  if (!data) {
    return (
      <div className="loading">
        <strong>{loadError ? "Backend connection failed" : "Loading SSG Study Platform..."}</strong>
        {loadError && <span>{loadError}. Start the app with npm run dev and open http://localhost:5173.</span>}
      </div>
    );
  }

  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">SSG</span>
          <div>
            <strong>Study Sphere</strong>
            <small>Realtime campus SaaS</small>
          </div>
        </div>
        <nav>
          {[
            ["Servers", Server],
            ["Live Class", Video],
            ["Past Papers", Library],
            ["Notes & Videos", BookOpen],
            ["Tasks", ClipboardList],
            ["AI Tools", Brain]
          ].map(([label, Icon]) => (
            <a href={`#${label.toLowerCase().replaceAll(" ", "-")}`} key={label}>
              <Icon size={18} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <section className="shell">
        <header className="topbar">
          <div>
            <p>Study operations platform</p>
            <h1>Servers, live classes, authenticated resources, and AI learning in one workspace.</h1>
          </div>
          <div className="accountCard">
            {currentUser ? (
              <>
                <ShieldCheck size={18} />
                <div>
                  <strong>{currentUser.name}</strong>
                  <span>{currentUser.email} · {currentUser.role}</span>
                </div>
                <button className="iconButton" onClick={logout} title="Logout"><LogOut size={17} /></button>
              </>
            ) : (
              <LoginBox onLogin={async (result) => { localStorage.setItem("ssg_token", result.token); await load(); }} />
            )}
          </div>
        </header>

        {notice && <div className="notice">{notice}</div>}

        <section className="metrics">
          <Metric icon={Server} label="Servers" value={data.workspaces.length} />
          <Metric icon={Video} label="Live sessions" value={data.sessions.length} />
          <Metric icon={CheckCircle2} label="Productivity" value={`${productivity.score}%`} />
          <Metric icon={Library} label="Departments" value={data.departments.length} />
        </section>

        <section className="grid serverLayout" id="servers">
          <Panel title="Server Area" icon={Server}>
            <Gate user={currentUser} text="Login to create or join study servers.">
              <div className="splitForms">
                <WorkspaceForm onCreate={(body) => refreshAfter(request("/api/workspaces", { method: "POST", body: JSON.stringify(body) }), "Server created")} />
                <JoinWorkspaceForm onJoin={(body) => refreshAfter(request("/api/workspaces/join", { method: "POST", body: JSON.stringify(body) }), "Joined server")} />
              </div>
            </Gate>
            <div className="serverList">
              {data.workspaces.map((workspace) => (
                <button className={`serverTile ${workspace.id === activeWorkspaceId ? "active" : ""}`} key={workspace.id} onClick={() => setActiveWorkspaceId(workspace.id)}>
                  <strong>{workspace.name}</strong>
                  <span>{workspace.community}</span>
                  <code>{workspace.joinCode}</code>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title={activeWorkspace ? activeWorkspace.name : "Select a Server"} icon={Users}>
            {activeWorkspace ? (
              <ServerRoom
                workspace={activeWorkspace}
                messages={workspaceMessages}
                sessions={data.sessions.filter((session) => session.workspaceId === activeWorkspace.id)}
                currentUser={currentUser}
                refreshAfter={refreshAfter}
                onEnterClass={setActiveMeeting}
                onDelete={() => refreshAfter(request(`/api/workspaces/${activeWorkspace.id}`, { method: "DELETE" }), "Server deleted").then(() => setActiveWorkspaceId(""))}
                onLeave={() => refreshAfter(request(`/api/workspaces/${activeWorkspace.id}/leave`, { method: "POST" }), "Left server").then(() => setActiveWorkspaceId(""))}
              />
            ) : (
              <EmptyState text="Create or join a server to open chat and live sessions." />
            )}
          </Panel>
        </section>

        {activeMeeting && (
          <Panel id="live-class" title={`Live Class · ${activeMeeting.title}`} icon={Video}>
            <LiveClassRoom meeting={activeMeeting} user={currentUser} onLeave={leaveMeeting} />
          </Panel>
        )}

        <section className="grid libraryGrid">
          <Panel title="Admin Departments" icon={FolderPlus}>
            {isAdmin ? (
              <>
                <DepartmentForm onCreate={(body) => refreshAfter(request("/api/departments", { method: "POST", body: JSON.stringify(body) }), "Department added")} />
                <button onClick={() => refreshAfter(request(`/api/departments/${activeDepartment.id}/semesters`, { method: "POST", body: JSON.stringify({}) }), "Semester added")}>
                  <Plus size={17} />Add Semester
                </button>
              </>
            ) : (
              <EmptyState text="Only the admin can add departments or semesters." />
            )}
            <div className="chips">
              {data.departments.map((department) => (
                <button className={department.id === activeDepartmentId ? "active" : ""} onClick={() => setActiveDepartmentId(department.id)} key={department.id}>
                  {department.name}
                </button>
              ))}
            </div>
            <div className="semesterGrid">
              {activeDepartment?.semesters.map((semester) => (
                <div className="semesterCell" key={semester.id}>
                  <button className={semester.id === activeSemester?.id ? "active" : ""} onClick={() => setActiveSemesterId(semester.id)}>
                    Semester {semester.number}
                  </button>
                  {isAdmin && (
                    <button className="dangerButton" onClick={() => refreshAfter(request(`/api/departments/${activeDepartment.id}/semesters/${semester.id}`, { method: "DELETE" }), "Semester deleted")}>
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <Panel id="past-papers" title={`${activeDepartment?.name || "Department"} / Semester ${activeSemester?.number || 1}`} icon={Library}>
            <Gate user={currentUser} text="Login to add subjects, notes, videos, and past papers.">
              <SubjectForm onCreate={(body) => refreshAfter(request(`/api/departments/${activeDepartment.id}/semesters/${activeSemester.id}/subjects`, { method: "POST", body: JSON.stringify(body) }), "Subject added")} />
            </Gate>
            <div className="subjects">
              {activeSemester?.subjects.map((subject) => (
                <button className={subject.id === activeSubject?.id ? "active" : ""} onClick={() => setActiveSubjectId(subject.id)} key={subject.id}>
                  {subject.name}
                </button>
              ))}
            </div>
            {activeSubject ? (
              <ResourceManager
                subject={activeSubject}
                currentUser={currentUser}
                canDelete={isAdmin || activeSubject.createdBy === currentUser?.email}
                onDelete={() => refreshAfter(request(`/api/departments/${activeDepartment.id}/semesters/${activeSemester.id}/subjects/${activeSubject.id}`, { method: "DELETE" }), "Study section deleted").then(() => setActiveSubjectId(""))}
                refreshAfter={refreshAfter}
              />
            ) : (
              <EmptyState text="Add a subject to unlock midterm papers, finals, notes, and videos." />
            )}
          </Panel>
        </section>

        <section className="grid two">
          <Panel id="tasks" title="Tasks" icon={ClipboardList}>
            <Gate user={currentUser} text="Login to manage tasks.">
              <TaskForm onCreate={(body) => refreshAfter(request("/api/tasks", { method: "POST", body: JSON.stringify(body) }), "Task added")} />
            </Gate>
            {data.tasks.slice(0, 6).map((task) => (
              <div className="task" key={task.id}>
                <button className="taskToggle" onClick={() => refreshAfter(request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ done: !task.done }) }), "Task updated")}>
                  <CheckCircle2 size={18} className={task.done ? "done" : ""} />
                  <span>
                    <b>{task.title}</b>
                    {task.dueDate && <small>{formatTaskDueDate(task.dueDate)}</small>}
                  </span>
                </button>
                <button className="iconButton dangerButton" onClick={() => refreshAfter(request(`/api/tasks/${task.id}`, { method: "DELETE" }), "Task deleted")} title="Delete task" aria-label={`Delete task ${task.title}`}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </Panel>

          <Panel id="ai-tools" title="AI Learning Tools" icon={Sparkles}>
            <Gate user={currentUser} text="Login to use AI learning tools.">
              <AiTool onResult={setAiResult} />
            </Gate>
            {aiResult && (
              <div className="aiResult">
                <strong>Provider: {aiResult.provider}</strong>
                <p>{aiResult.summary}</p>
                <strong>Flashcards</strong>
                {aiResult.flashcards?.map((card) => (
                  <span key={card.question}>
                    <b>{card.question}</b>
                    {card.answer}
                  </span>
                ))}
                <strong>Study Plan</strong>
                {aiResult.plan?.map((step) => <span key={step}>{step}</span>)}
              </div>
            )}
          </Panel>
        </section>

      </section>
    </main>
  );
}

function LoginBox({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  return (
    <form className="loginBox" onSubmit={(event) => {
      event.preventDefault();
      request(endpoint, { method: "POST", body: JSON.stringify({ name, email, password }) }, "").then(onLogin);
    }}>
      <div className="authTabs">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
        <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
      </div>
      {mode === "register" && <Field placeholder="Full name" value={name} onChange={setName} />}
      <Field placeholder="Gmail address" value={email} onChange={setEmail} />
      <Field placeholder="Password" value={password} onChange={setPassword} type="password" />
      <button><LogIn size={17} />{mode === "register" ? "Create account" : "Login"}</button>
      <div id="google-login" className="googleSlot" />
      {!GOOGLE_CLIENT_ID && <small>Google Sign-In appears after setting VITE_GOOGLE_CLIENT_ID.</small>}
    </form>
  );
}

function ServerRoom({ workspace, messages, sessions, currentUser, refreshAfter, onEnterClass, onDelete, onLeave }) {
  const isOwner = currentUser && workspace.createdBy === currentUser.email;
  const isAdmin = currentUser?.role === "admin";
  const isMember = currentUser && workspace.members?.some((member) => member.email === currentUser.email);

  return (
    <div className="serverRoom">
      <div className="serverMeta">
        <span>Join code</span>
        <code>{workspace.joinCode}</code>
        <button className="iconButton" title="Copy code" onClick={() => navigator.clipboard?.writeText(workspace.joinCode)}><Copy size={16} /></button>
        {currentUser && (isAdmin || isOwner) && (
          <button className="dangerButton" onClick={onDelete}>Delete server</button>
        )}
        {isMember && !isOwner && !isAdmin && (
          <button className="dangerButton" onClick={onLeave}>Leave server</button>
        )}
      </div>
      <MessageForm disabled={!currentUser} workspaceId={workspace.id} onSend={(body) => refreshAfter(request("/api/messages", { method: "POST", body: JSON.stringify(body) }), "Message sent")} />
      <div className="chat">
        {messages.map((message) => (
          <div className="bubble" key={message.id}>
            <strong>{message.author}</strong>
            <span>{message.text}</span>
          </div>
        ))}
      </div>
      <SessionForm workspaceId={workspace.id} onCreate={(body) => refreshAfter(request("/api/sessions", { method: "POST", body: JSON.stringify(body) }), "Live class created")} />
      <div className="list">
        {sessions.map((session) => (
          <article className="item" key={session.id}>
            <div>
              <strong>{session.title}</strong>
              <span>Meet code {session.meetingCode} / hosted by {session.host}</span>
            </div>
            <div className="rowActions">
              <button onClick={() => onEnterClass(session)}><Video size={17} />Join</button>
              <button className="dangerButton" onClick={() => refreshAfter(request(`/api/sessions/${session.id}`, { method: "DELETE" }), "Session left")}>Leave</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function LiveClassRoom({ meeting, user, onLeave }) {
  const videoRef = useRef(null);
  const socketRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [screen, setScreen] = useState(false);
  const [camera, setCamera] = useState(false);
  const [mic, setMic] = useState(false);
  const [chat, setChat] = useState([]);
  const [text, setText] = useState("");
  const [participants, setParticipants] = useState(user ? [user.name] : []);

  useEffect(() => {
    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit("live:join", { meetingCode: meeting.meetingCode, user });
    socket.on("live:participant", (participant) => setParticipants((items) => [...new Set([...items, participant?.name].filter(Boolean))]));
    socket.on("live:chat", (message) => setChat((items) => [...items, message]));
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      socket.disconnect();
    };
  }, [meeting.meetingCode]);

  const attachStream = (nextStream) => {
    setStream(nextStream);
    if (videoRef.current) videoRef.current.srcObject = nextStream;
  };

  const startCamera = async () => {
    const nextStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    attachStream(nextStream);
    setCamera(true);
    setMic(true);
    setScreen(false);
  };

  const shareScreen = async () => {
    const nextStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    attachStream(nextStream);
    setScreen(true);
    setCamera(false);
  };

  const stopMedia = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera(false);
    setMic(false);
    setScreen(false);
  };

  const leaveClass = () => {
    stopMedia();
    socketRef.current?.disconnect();
    onLeave();
  };

  const toggleMic = () => {
    stream?.getAudioTracks().forEach((track) => { track.enabled = !track.enabled; setMic(track.enabled); });
  };

  return (
    <div className="liveRoom">
      <div className="stage">
        <video ref={videoRef} autoPlay playsInline muted />
        {!stream && <div className="stageEmpty">Camera or screen share preview</div>}
      </div>
      <div className="meetingPanel">
        <div className="serverMeta">
          <span>Meeting code</span>
          <code>{meeting.meetingCode}</code>
          <button className="iconButton" onClick={() => navigator.clipboard?.writeText(meeting.meetingCode)} title="Copy meeting code"><Copy size={16} /></button>
        </div>
        <div className="controls">
          <button onClick={startCamera}>{camera ? <VideoOff size={17} /> : <Camera size={17} />}Camera</button>
          <button onClick={toggleMic}>{mic ? <Mic size={17} /> : <MicOff size={17} />}Mic</button>
          <button onClick={shareScreen}>{screen ? <ScreenShareOff size={17} /> : <MonitorUp size={17} />}Share</button>
          <button onClick={stopMedia}><VideoOff size={17} />Leave media</button>
          <button className="dangerButton" onClick={leaveClass}>Leave session</button>
        </div>
        <div className="participants">
          <strong>Participants</strong>
          {participants.map((participant) => <span key={participant}>{participant}</span>)}
        </div>
        <form className="inlineForm compactForm" onSubmit={(event) => {
          event.preventDefault();
          const message = { id: crypto.randomUUID(), author: user?.name || "Student", text };
          socketRef.current?.emit("live:chat", { meetingCode: meeting.meetingCode, message });
          setText("");
        }}>
          <Field placeholder="Live class chat" value={text} onChange={setText} />
          <button><MessageSquare size={17} />Send</button>
        </form>
        <div className="chat smallChat">
          {chat.map((message) => <div className="bubble" key={message.id}><strong>{message.author}</strong><span>{message.text}</span></div>)}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return <article className="metric"><Icon size={20} /><span>{label}</span><strong>{value}</strong></article>;
}

function Panel({ id, title, icon: Icon, children }) {
  return <section className="panel" id={id}><div className="panelTitle"><Icon size={20} /><h2>{title}</h2></div>{children}</section>;
}

function Gate({ user, text, children }) {
  return user ? children : <EmptyState text={text} />;
}

function Field({ placeholder, value, onChange, type = "text" }) {
  return <input type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function formatTaskDueDate(dateValue) {
  const due = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(due.getTime())) return "";

  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.ceil((startDue - startToday) / 86400000);
  const dayName = due.toLocaleDateString(undefined, { weekday: "long" });
  const dateLabel = due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (days > 1) return `Due ${dateLabel} (${dayName}) / ${days} days remaining`;
  if (days === 1) return `Due ${dateLabel} (${dayName}) / tomorrow`;
  if (days === 0) return `Due ${dateLabel} (${dayName}) / today`;
  return `Due ${dateLabel} (${dayName}) / ${Math.abs(days)} days overdue`;
}

function DepartmentForm({ onCreate }) {
  const [name, setName] = useState("");
  return <InlineForm icon={Plus} action="Add" onSubmit={() => onCreate({ name }).then(() => setName(""))}><Field placeholder="New department" value={name} onChange={setName} /></InlineForm>;
}

function WorkspaceForm({ onCreate }) {
  const [name, setName] = useState("");
  const [community, setCommunity] = useState("");
  return <InlineForm icon={Plus} action="Create" onSubmit={() => onCreate({ name, community }).then(() => { setName(""); setCommunity(""); })}><Field placeholder="Server name" value={name} onChange={setName} /><Field placeholder="Community" value={community} onChange={setCommunity} /></InlineForm>;
}

function JoinWorkspaceForm({ onJoin }) {
  const [joinCode, setJoinCode] = useState("");
  return <InlineForm icon={LogIn} action="Join" onSubmit={() => onJoin({ joinCode }).then(() => setJoinCode(""))}><Field placeholder="Server code" value={joinCode} onChange={setJoinCode} /></InlineForm>;
}

function MessageForm({ onSend, workspaceId, disabled }) {
  const [text, setText] = useState("");
  return <InlineForm icon={MessageSquare} action="Send" onSubmit={() => !disabled && onSend({ workspaceId, text }).then(() => setText(""))}><Field placeholder="Type a realtime message" value={text} onChange={setText} /></InlineForm>;
}

function SubjectForm({ onCreate }) {
  const [name, setName] = useState("");
  return <InlineForm icon={BookOpen} action="Add Subject" onSubmit={() => onCreate({ name }).then(() => setName(""))}><Field placeholder="Subject name" value={name} onChange={setName} /></InlineForm>;
}

function ResourceManager({ subject, currentUser, canDelete, onDelete, refreshAfter }) {
  const [activeResource, setActiveResource] = useState(null);
  const [activeSolution, setActiveSolution] = useState(null);
  const [solvingId, setSolvingId] = useState("");
  const [solveError, setSolveError] = useState("");
  const canDeleteResource = (item) => currentUser && (currentUser.role === "admin" || item.addedByEmail === currentUser.email || subject.createdBy === currentUser.email);
  const deleteResource = (path) => refreshAfter(request(path, { method: "DELETE" }), "Upload deleted").then(() => setActiveResource(null));
  const solvePaper = async (item, term) => {
    setSolveError("");
    if (item.solution) {
      setActiveSolution({ item, solution: item.solution });
      return;
    }
    setSolvingId(item.id);
    try {
      const solution = await request(`/api/subjects/${subject.id}/papers/${term}/${item.id}/solve`, { method: "POST", body: JSON.stringify({}) });
      setActiveSolution({ item, solution });
    } catch (error) {
      setSolveError(error.message);
    } finally {
      setSolvingId("");
    }
  };

  return (
    <div className="resourceArea">
      {canDelete && <button className="dangerButton" onClick={onDelete}>Delete study section</button>}
      <Gate user={currentUser} text="Login to upload resources.">
        <ResourceForm label="Midterm paper" icon={Upload} accept="application/pdf,image/*" onCreate={(body) => refreshAfter(uploadFile(`/api/subjects/${subject.id}/papers/upload?term=midterm`, body), "Midterm uploaded")} />
        <ResourceForm label="Final paper" icon={Upload} accept="application/pdf,image/*" onCreate={(body) => refreshAfter(uploadFile(`/api/subjects/${subject.id}/papers/upload?term=finals`, body), "Final uploaded")} />
        <ResourceForm label="Note" icon={FileText} accept="application/pdf,image/*,text/plain" onCreate={(body) => refreshAfter(uploadFile(`/api/subjects/${subject.id}/resources/upload?type=notes`, body), "Note uploaded")} />
        <ResourceForm label="Video" icon={Video} accept="video/*" onCreate={(body) => refreshAfter(uploadFile(`/api/subjects/${subject.id}/resources/upload?type=videos`, body), "Video uploaded")} />
      </Gate>
      {solveError && <span className="formError">{solveError}</span>}
      <div className="columns">
        <ResourceList title="Midterms" items={subject.papers.midterm} kind="document" onOpen={setActiveResource} canDelete={canDeleteResource} onDelete={(item) => deleteResource(`/api/subjects/${subject.id}/papers/midterm/${item.id}`)} onSolve={(item) => solvePaper(item, "midterm")} solvingId={solvingId} />
        <ResourceList title="Finals" items={subject.papers.finals} kind="document" onOpen={setActiveResource} canDelete={canDeleteResource} onDelete={(item) => deleteResource(`/api/subjects/${subject.id}/papers/finals/${item.id}`)} onSolve={(item) => solvePaper(item, "finals")} solvingId={solvingId} />
        <ResourceList title="Notes" items={subject.notes} kind="document" onOpen={setActiveResource} canDelete={canDeleteResource} onDelete={(item) => deleteResource(`/api/subjects/${subject.id}/resources/notes/${item.id}`)} />
        <ResourceList title="Videos" items={subject.videos} kind="video" onOpen={setActiveResource} canDelete={canDeleteResource} onDelete={(item) => deleteResource(`/api/subjects/${subject.id}/resources/videos/${item.id}`)} />
      </div>
      {activeResource && <ResourceModal resource={activeResource} onClose={() => setActiveResource(null)} />}
      {activeSolution && <SolutionModal item={activeSolution.item} solution={activeSolution.solution} onClose={() => setActiveSolution(null)} />}
    </div>
  );
}

function ResourceForm({ label, icon: Icon, accept, onCreate }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");

  return (
    <form className="inlineForm uploadForm" onSubmit={(event) => {
      event.preventDefault();
      setError("");
      if (!file) {
        setError("Choose a file to upload.");
        return;
      }
      onCreate({ title, file }).then(() => {
        setTitle("");
        setFile(null);
        event.currentTarget.reset();
      });
    }}>
      <Field placeholder={`${label} title`} value={title} onChange={setTitle} />
      <label className="filePicker">
        <input type="file" accept={accept} onChange={(event) => setFile(event.target.files?.[0] || null)} />
        <span>{file ? file.name : "Choose file"}</span>
      </label>
      <button title={label}><Icon size={17} /><span>{label}</span></button>
      {error && <span className="formError">{error}</span>}
    </form>
  );
}

function ResourceList({ title, items, kind, onOpen, canDelete, onDelete, onSolve, solvingId }) {
  return (
    <div className="resourceList">
      <strong>{title}</strong>
      {items.length ? items.map((item) => (
        <article className="resourceItem" key={item.id}>
          <ResourceViewer item={item} kind={kind} onOpen={onOpen} />
          <div className="resourceActions">
            {onSolve && (
              <button onClick={() => onSolve(item)} disabled={solvingId === item.id} title="Solve PastPaper">
                <Sparkles size={17} />
                <span>{solvingId === item.id ? "Solving" : "Solve PastPaper"}</span>
              </button>
            )}
            {canDelete(item) && (
              <button className="iconButton dangerButton" onClick={() => onDelete(item)} title="Delete upload" aria-label={`Delete ${item.title}`}>
                <Trash2 size={17} />
              </button>
            )}
          </div>
        </article>
      )) : <span>No uploads yet</span>}
    </div>
  );
}

function getResourceDetails(item, kind) {
  const src = item.fileUrl ? `${API_URL}${item.fileUrl}` : item.url;
  return {
    src,
    isVideo: kind === "video" || item.mimeType?.startsWith("video/"),
    isImage: item.mimeType?.startsWith("image/")
  };
}

function ResourceViewer({ item, kind, onOpen }) {
  const { src, isVideo, isImage } = getResourceDetails(item, kind);

  return (
    <button className="resourceViewer" onClick={() => onOpen({ item, kind })}>
      <div>
        <b>{item.title}</b>
        <span>by {item.addedBy || "Student"}</span>
      </div>
      {src ? (
        <div className="resourcePreview" aria-hidden="true">
          {isVideo ? (
            <video src={src} muted preload="metadata" onContextMenu={(event) => event.preventDefault()} />
          ) : isImage ? (
            <img src={src} alt="" onContextMenu={(event) => event.preventDefault()} />
          ) : (
            <iframe src={`${src}#toolbar=0&navpanes=0&page=1`} title={`${item.title} preview`} tabIndex="-1" />
          )}
        </div>
      ) : (
        <span>Upload unavailable</span>
      )}
    </button>
  );
}

function ResourceModal({ resource, onClose }) {
  const { item, kind } = resource;
  const { src, isVideo, isImage } = getResourceDetails(item, kind);
  const [zoom, setZoom] = useState(1);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.body.classList.add("modalOpen");
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("modalOpen");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="resourceModal" role="dialog" aria-modal="true" aria-label={item.title}>
      <header>
        <div>
          <strong>{item.title}</strong>
          <span>by {item.addedBy || "Student"}</span>
        </div>
        <div className="viewerActions">
          {!isVideo && item.fileUrl && (
            <button onClick={() => setScanOpen((value) => !value)} title="Scan paper"><Search size={17} /><span>Scan</span></button>
          )}
          {isVideo && (
            <>
              <button className="iconButton" onClick={() => setZoom((value) => Math.max(.5, Number((value - .25).toFixed(2))))} title="Zoom out" aria-label="Zoom out"><ZoomOut size={18} /></button>
              <button className="zoomValue" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</button>
              <button className="iconButton" onClick={() => setZoom((value) => Math.min(2.5, Number((value + .25).toFixed(2))))} title="Zoom in" aria-label="Zoom in"><ZoomIn size={18} /></button>
            </>
          )}
          <button className="iconButton" onClick={onClose} title="Close viewer" aria-label="Close viewer"><X size={20} /></button>
        </div>
      </header>
      {scanOpen && <ScanPanel item={item} />}
      <div className={`resourceStage ${isVideo ? "videoStage" : ""}`}>
        {src ? (
          isVideo ? (
            <video src={src} controls autoPlay controlsList="nodownload" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }} onContextMenu={(event) => event.preventDefault()} />
          ) : isImage ? (
            <img src={src} alt={item.title} onContextMenu={(event) => event.preventDefault()} />
          ) : (
            <iframe src={`${src}#toolbar=0&navpanes=0`} title={item.title} />
          )
        ) : (
          <span>Upload unavailable</span>
        )}
      </div>
    </div>
  );
}

function ScanPanel({ item }) {
  const imageRef = useRef(null);
  const [mode, setMode] = useState("select");
  const [page, setPage] = useState(1);
  const [imageUrl, setImageUrl] = useState("");
  const [selection, setSelection] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let revokedUrl = "";
    setStatus("Preparing scan");
    setSelection(null);
    requestBlob(`/api/paper-scan?fileUrl=${encodeURIComponent(item.fileUrl)}&page=${page}&mode=${mode === "whole" ? "whole" : "page"}`)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        revokedUrl = url;
        setImageUrl(url);
        setStatus("Ready to copy");
      })
      .catch((error) => setStatus(error.message));
    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [item.fileUrl, page, mode]);

  const pointerPosition = (event) => {
    const rect = imageRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top))
    };
  };

  const startSelection = (event) => {
    if (mode !== "select" || !imageRef.current) return;
    const position = pointerPosition(event);
    setDragStart(position);
    setSelection({ x: position.x, y: position.y, width: 0, height: 0 });
  };

  const moveSelection = (event) => {
    if (mode !== "select" || !dragStart || !imageRef.current) return;
    const position = pointerPosition(event);
    setSelection({
      x: Math.min(dragStart.x, position.x),
      y: Math.min(dragStart.y, position.y),
      width: Math.abs(position.x - dragStart.x),
      height: Math.abs(position.y - dragStart.y)
    });
  };

  const copyScan = async () => {
    if (!imageRef.current || !imageUrl) return;
    const image = imageRef.current;
    const canvas = document.createElement("canvas");
    const rect = image.getBoundingClientRect();
    const scaleX = image.naturalWidth / rect.width;
    const scaleY = image.naturalHeight / rect.height;
    const crop = mode === "select" && selection?.width > 8 && selection?.height > 8
      ? {
          x: selection.x * scaleX,
          y: selection.y * scaleY,
          width: selection.width * scaleX,
          height: selection.height * scaleY
        }
      : { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };

    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));
    canvas.getContext("2d").drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob || !navigator.clipboard || !window.ClipboardItem) throw new Error("Image clipboard is not available in this browser.");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  };

  const openAi = async (url) => {
    const nextTab = window.open("about:blank", "_blank");
    try {
      setStatus("Copying image");
      await copyScan();
      setStatus("Copied. Paste it in the AI tab with Ctrl+V.");
      if (nextTab) nextTab.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      nextTab?.close();
      setStatus(error.message);
    }
  };

  return (
    <div className="scanPanel">
      <div className="scanControls">
        <div className="authTabs">
          <button type="button" className={mode === "select" ? "active" : ""} onClick={() => setMode("select")}>Select area</button>
          <button type="button" className={mode === "full" ? "active" : ""} onClick={() => setMode("full")}>Full screen</button>
          <button type="button" className={mode === "whole" ? "active" : ""} onClick={() => setMode("whole")}>Whole PDF</button>
        </div>
        {mode !== "whole" && <input type="number" min="1" value={page} onChange={(event) => setPage(Math.max(1, Number(event.target.value || 1)))} aria-label="PDF page" />}
        <span>{status}</span>
      </div>
      <div className="aiDestinations">
        {AI_DESTINATIONS.map(([label, url]) => (
          <button key={label} type="button" onClick={() => openAi(url)}>{label}</button>
        ))}
      </div>
      <div
        className={`scanCanvas ${mode === "select" ? "selecting" : ""}`}
        onPointerDown={startSelection}
        onPointerMove={moveSelection}
        onPointerUp={() => setDragStart(null)}
        onPointerLeave={() => setDragStart(null)}
      >
        {imageUrl ? <img ref={imageRef} src={imageUrl} alt={`${item.title} scan`} draggable="false" /> : <span>Preparing scan</span>}
        {mode === "select" && selection && (
          <div
            className="selectionBox"
            style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
          />
        )}
      </div>
    </div>
  );
}

function SolutionModal({ item, solution, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.body.classList.add("modalOpen");
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("modalOpen");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="resourceModal" role="dialog" aria-modal="true" aria-label={`${item.title} solution`}>
      <header>
        <div>
          <strong>{item.title} solution</strong>
          <span>{solution.provider} / {solution.solvedAt ? new Date(solution.solvedAt).toLocaleString() : "Generated now"}</span>
        </div>
        <div className="viewerActions">
          <button className="iconButton" onClick={onClose} title="Close solution" aria-label="Close solution"><X size={20} /></button>
        </div>
      </header>
      <div className="solutionStage">
        <article className="solutionPaper">
          <pre>{solution.solution}</pre>
        </article>
      </div>
    </div>
  );
}

function TaskForm({ onCreate }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  return (
    <InlineForm icon={Plus} action="Task" onSubmit={() => onCreate({ title, dueDate }).then(() => { setTitle(""); setDueDate(""); })}>
      <Field placeholder="Add study task" value={title} onChange={setTitle} />
      <Field type="date" placeholder="Due date" value={dueDate} onChange={setDueDate} />
    </InlineForm>
  );
}

function SessionForm({ onCreate, workspaceId }) {
  const [title, setTitle] = useState("");
  return <InlineForm icon={CalendarClock} action="Create Live Class" onSubmit={() => onCreate({ title, duration: 60, workspaceId }).then(() => setTitle(""))}><Field placeholder="Live class topic" value={title} onChange={setTitle} /></InlineForm>;
}

function NoteForm({ onCreate }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <form className="noteForm" onSubmit={(event) => { event.preventDefault(); onCreate({ title, body }).then(() => { setTitle(""); setBody(""); }); }}>
      <Field placeholder="Note title" value={title} onChange={setTitle} />
      <textarea placeholder="Collaborative note body" value={body} onChange={(event) => setBody(event.target.value)} />
      <button><FileText size={17} />Save note</button>
    </form>
  );
}

function AiTool({ onResult }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return (
    <form className="noteForm" onSubmit={async (event) => {
      event.preventDefault();
      setLoading(true);
      setError("");
      try {
        onResult(await request("/api/ai/suggest", { method: "POST", body: JSON.stringify({ text }) }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }}>
      <textarea placeholder="Paste study notes for AI summary, flashcards, and revision plan" value={text} onChange={(event) => setText(event.target.value)} />
      <button disabled={loading}><Sparkles size={17} />{loading ? "Generating" : "Generate"}</button>
      {error && <span className="formError">{error}</span>}
    </form>
  );
}

function InlineForm({ children, icon: Icon, action, onSubmit }) {
  return <form className={`inlineForm ${React.Children.count(children) === 1 ? "compactForm" : ""}`} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>{children}<button title={action}><Icon size={17} /><span>{action}</span></button></form>;
}

function EmptyState({ text }) {
  return <div className="empty">{text}</div>;
}

export default App;
