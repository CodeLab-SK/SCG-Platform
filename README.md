# SSG Study Platform

A full-stack React + Express study SaaS prototype for departments, semesters, past papers, notes, videos, realtime communities, tasks, study sessions, productivity tracking, and AI-assisted learning.

## Run locally

```bash
npm install
npm run dev
```

- Frontend: `http://localhost<!--  -->:5173`
- Backend API and Socket.IO: `http://lo calhost:4000`

The backend stores local development data in `server/db.json`. On first run it seeds two default departments: Software Engineering and Computer Science. Every new department automatically receives Semester 1 through Semester 8.

## Admin login

- Email: `sahilisthebest885@gmail.com`
- Password: `sahil@885`

The admin can add departments and extra semesters. Students can add subjects, notes, videos, and past papers after login.

Students can register from the login panel with a Gmail address and password. Existing users log in from the same panel. For real Google verification, set up the Google OAuth client ID below and use the Google Sign-In button.

## Google and AI setup

Google login is wired for Google Identity Services. Add a Google OAuth web client ID before starting Vite:

```bash
$env:VITE_GOOGLE_CLIENT_ID="your-google-client-id"
npm run dev
```

The AI learning tool uses the Google Gemini API when `GEMINI_API_KEY` is available. If no Gemini key is set, it calls the free no-key Pollinations AI API. If both external calls fail, the app uses a small local fallback so the feature still responds during development.

```bash
$env:GEMINI_API_KEY="your-gemini-api-key"
$env:GEMINI_MODEL="gemini-1.5-flash"
npm run dev
```
