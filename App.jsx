import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, CalendarDays, CheckCircle2, Footprints, Mic, MicOff, Pause, Play, RotateCcw, Save, Shield, Trophy, Zap } from "lucide-react";

const LEVELS = [
  { name: "1A", six: 1, navy: 1 },
  { name: "1B", six: 50, navy: 20 },
  { name: "1C", six: 100, navy: 40 },
  { name: "1D", six: 150, navy: 60 },
  { name: "2A", six: 200, navy: 80 },
  { name: "2B", six: 225, navy: 90 },
  { name: "3A", six: 250, navy: 100 },
  { name: "3B", six: 260, navy: 110 },
  { name: "4A", six: 275, navy: 120 },
  { name: "4B", six: 300, navy: 135 },
  { name: "Graduate", six: 325, navy: 150 },
];

const STORAGE_KEY = "busy_dad_tracker_v1";
const todayISO = () => new Date().toISOString().slice(0, 10);

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getWorkoutLabel(type) {
  if (type === "six") return "6-Count Military Burpees";
  if (type === "navy") return "Navy Seal Burpees";
  return "Scheduled Walk";
}

function getWorkoutIcon(type) {
  if (type === "six") return <Zap size={20} />;
  if (type === "navy") return <Shield size={20} />;
  return <Footprints size={20} />;
}

function getPersonalBests(sessions) {
  const completed = sessions.filter((s) => s.type === "six" || s.type === "navy");
  return {
    six: Math.max(0, ...completed.filter((s) => s.type === "six" && s.seconds <= 1200).map((s) => s.reps)),
    navy: Math.max(0, ...completed.filter((s) => s.type === "navy" && s.seconds <= 1200).map((s) => s.reps)),
  };
}

function getCurrentLevel(best) {
  let current = LEVELS[0];
  for (const level of LEVELS) if (best.six >= level.six && best.navy >= level.navy) current = level;
  return current;
}

function getNextLevel(current) {
  const index = LEVELS.findIndex((l) => l.name === current.name);
  return LEVELS[Math.min(index + 1, LEVELS.length - 1)];
}

function parseSpokenNumber(raw) {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9\s]/g, " ").trim();
  const digitMatch = text.match(/\b\d{1,3}\b/g);
  if (digitMatch?.length) return Number(digitMatch[digitMatch.length - 1]);

  const small = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
  const tens = { twenty:20, thirty:30, forty:40, fourty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
  const words = text.split(/\s+/).filter(Boolean);
  let lastNumber = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (small[w] !== undefined) lastNumber = small[w];
    if (tens[w] !== undefined) {
      let value = tens[w];
      if (small[words[i + 1]] !== undefined && small[words[i + 1]] < 10) value += small[words[i + 1]];
      lastNumber = value;
    }
    if (w === "hundred") lastNumber = lastNumber ? lastNumber * 100 : 100;
  }
  return lastNumber;
}

function ProgressBar({ value, max }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return <div className="progress"><div className="progressFill" style={{ width: `${pct}%` }} /></div>;
}

function StatCard({ label, value, icon }) {
  return <div className="stat"><div className="statTop">{icon}<span>{label}</span></div><div className="statValue">{value}</div></div>;
}

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [activeType, setActiveType] = useState("six");
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [reps, setReps] = useState(0);
  const [walkMinutes, setWalkMinutes] = useState(30);
  const [walkDistance, setWalkDistance] = useState(0);
  const [notes, setNotes] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [lastHeard, setLastHeard] = useState("Voice idle");
  const recognitionRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSessions(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      setLastHeard("Voice not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const latest = event.results[event.results.length - 1][0].transcript.trim();
      const lower = latest.toLowerCase();
      const number = parseSpokenNumber(latest);
      setLastHeard(`Heard: “${latest}”`);
      if (number === null || Number.isNaN(number)) return;
      if (lower.includes("plus") || lower.includes("add")) return setReps((r) => Math.max(0, r + number));
      if (lower.includes("minus") || lower.includes("subtract") || lower.includes("down")) return setReps((r) => Math.max(0, r - number));
      setReps(Math.max(0, number));
    };

    recognition.onerror = (event) => {
      setLastHeard(`Voice issue: ${event.error}`);
      setVoiceOn(false);
    };

    recognition.onend = () => {
      if (voiceOn) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    return () => { try { recognition.stop(); } catch {} };
  }, [voiceOn]);

  const best = useMemo(() => getPersonalBests(sessions), [sessions]);
  const currentLevel = useMemo(() => getCurrentLevel(best), [best]);
  const nextLevel = useMemo(() => getNextLevel(currentLevel), [currentLevel]);

  const weekly = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const recent = sessions.filter((s) => new Date(s.date) >= cutoff);
    return {
      sessions: recent.length,
      burpees: recent.reduce((sum, s) => sum + (s.type === "walk" ? 0 : Number(s.reps || 0)), 0),
      walks: recent.filter((s) => s.type === "walk").length,
    };
  }, [sessions]);

  const plannedWorkout = useMemo(() => {
    const count = sessions.filter((s) => s.type === "six" || s.type === "navy").length;
    const sequence = ["six", "rest", "navy", "rest"];
    return sequence[count % sequence.length];
  }, [sessions]);

  const pace = seconds > 0 ? (reps / (seconds / 60)).toFixed(1) : "0.0";

  function toggleVoice() {
    if (!voiceSupported || !recognitionRef.current) return;
    if (voiceOn) {
      try { recognitionRef.current.stop(); } catch {}
      setVoiceOn(false);
      setLastHeard("Voice paused");
    } else {
      try {
        recognitionRef.current.start();
        setVoiceOn(true);
        setLastHeard("Listening... say “ten”, “twenty five”, or “plus five”");
      } catch {
        setLastHeard("Voice already starting. Try again in a second.");
      }
    }
  }

  function resetWorkout(type = activeType) {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setVoiceOn(false);
    setActiveType(type);
    setSeconds(0);
    setReps(0);
    setRunning(false);
    setNotes("");
    setWalkDistance(0);
    setLastHeard("Voice idle");
  }

  function saveSession() {
    const session = {
      id: crypto.randomUUID(),
      date: todayISO(),
      type: activeType,
      reps: activeType === "walk" ? 0 : reps,
      seconds: activeType === "walk" ? walkMinutes * 60 : seconds,
      minutes: activeType === "walk" ? walkMinutes : Math.round(seconds / 60),
      distance: activeType === "walk" ? Number(walkDistance || 0) : 0,
      notes,
    };
    setSessions([session, ...sessions]);
    resetWorkout(activeType);
  }

  function deleteSession(id) {
    setSessions(sessions.filter((s) => s.id !== id));
  }

  return (
    <main className="app">
      <div className="container">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="header">
          <div>
            <p className="eyebrow">Busy Dad</p>
            <h1 className="title">Tracker V1</h1>
          </div>
          <div className="levelBadge"><small>Level</small><strong>{currentLevel.name}</strong></div>
        </motion.div>

        <section className="card">
          <div className="row">
            <div><p className="muted small">Next unlock</p><h2>Level {nextLevel.name}</h2></div>
            <Trophy color="#fb923c" size={34} />
          </div>
          <div className="progressLabel"><span>6-count</span><span>{best.six}/{nextLevel.six}</span></div>
          <ProgressBar value={best.six} max={nextLevel.six} />
          <div className="progressLabel"><span>Navy Seal</span><span>{best.navy}/{nextLevel.navy}</span></div>
          <ProgressBar value={best.navy} max={nextLevel.navy} />
        </section>

        <div className="grid3">
          <StatCard label="7D reps" value={weekly.burpees} icon={<Activity size={16} />} />
          <StatCard label="sessions" value={weekly.sessions} icon={<CalendarDays size={16} />} />
          <StatCard label="walks" value={weekly.walks} icon={<Footprints size={16} />} />
        </div>

        <section className="card">
          <p className="muted small">Suggested today</p>
          <div className="btnRow">
            {["six", "navy", "walk"].map((type) => (
              <button key={type} onClick={() => resetWorkout(type)} className={`btn flex ${activeType === type ? "active" : ""}`}>
                {type === "six" ? "6-Count" : type === "navy" ? "Navy" : "Walk"}
              </button>
            ))}
          </div>
          <p className="installHint">Cycle target: {plannedWorkout === "rest" ? "Rest day or walk" : getWorkoutLabel(plannedWorkout)}</p>
        </section>

        <section className="card orange">
          <div className="row">
            <div className="row" style={{ justifyContent: "flex-start", color: "#fb923c" }}>{getWorkoutIcon(activeType)}<strong>{getWorkoutLabel(activeType)}</strong></div>
            <button className="btn ghost" onClick={() => resetWorkout(activeType)}><RotateCcw size={18} /></button>
          </div>

          {activeType !== "walk" ? (
            <>
              <div className="timer">
                <div className="timerValue">{formatTime(seconds)}</div>
                <p className="muted small">20:00 landmark standard</p>
              </div>
              <div className="repValue">{reps}</div>
              <p className="center muted">reps · {pace}/min</p>

              <div className="voiceBox">
                <div className="row">
                  <div>
                    <strong>Voice count mode</strong>
                    <p className="installHint">Say “ten” to set reps to 10, or “plus five” to add 5.</p>
                  </div>
                  <button onClick={toggleVoice} disabled={!voiceSupported} className={`btn ${voiceOn ? "red" : ""}`}>
                    {voiceOn ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                </div>
                <p className={`small ${voiceOn ? "" : "faint"}`} style={{ color: voiceOn ? "#fb923c" : undefined }}>{lastHeard}</p>
              </div>

              <div className="repButtons">
                <button onClick={() => setReps(Math.max(0, reps - 1))} className="btn">-1</button>
                <button onClick={() => setReps(reps + 1)} className="btn orange">+1</button>
                <button onClick={() => setReps(reps + 5)} className="btn">+5</button>
              </div>
              <div className="actionButtons">
                <button onClick={() => setRunning(!running)} className="btn white">{running ? <Pause size={20} /> : <Play size={20} />}{running ? "Pause" : "Start"}</button>
                <button onClick={saveSession} disabled={reps === 0 || seconds === 0} className="btn orange"><Save size={20} />Save</button>
              </div>
            </>
          ) : (
            <>
              <div className="inputGrid">
                <label className="inputCard"><span>Minutes</span><input type="number" value={walkMinutes} onChange={(e) => setWalkMinutes(e.target.value)} /></label>
                <label className="inputCard"><span>KM</span><input type="number" step="0.1" value={walkDistance} onChange={(e) => setWalkDistance(e.target.value)} /></label>
              </div>
              <button onClick={saveSession} className="btn orange" style={{ width: "100%", marginTop: 14 }}><Save size={20} />Save Walk</button>
            </>
          )}

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes: energy, soreness, form, breathing..." />
        </section>

        <section className="card">
          <div className="row"><h2>History</h2><CheckCircle2 color="#fb923c" size={22} /></div>
          {sessions.length === 0 ? (
            <p className="muted small">No sessions yet. Save your next workout to start the campaign.</p>
          ) : (
            sessions.slice(0, 12).map((s) => (
              <div key={s.id} className="historyItem">
                <div className="row">
                  <div>
                    <p className="historyTitle">{getWorkoutLabel(s.type)}</p>
                    <p className="muted small">{s.date} · {s.type === "walk" ? `${s.minutes} min · ${s.distance || 0} km` : `${s.reps} reps · ${formatTime(s.seconds)} · ${(s.reps / (s.seconds / 60 || 1)).toFixed(1)}/min`}</p>
                    {s.notes && <p className="faint small">{s.notes}</p>}
                  </div>
                  <button onClick={() => deleteSession(s.id)} className="deleteBtn">Delete</button>
                </div>
              </div>
            ))
          )}
        </section>

        <p className="installHint">Install on Pixel: open this site in Chrome → menu ⋮ → Add to Home screen. Voice mode requires HTTPS or localhost.</p>
      </div>
    </main>
  );
}
