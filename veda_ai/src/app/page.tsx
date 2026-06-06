'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { api } from '@/services/api';
import { socketService } from '@/services/socket';

interface Assignment {
  id: string;
  title: string;
  subject: string;
  points: number;
  timeLimit: number;
  difficulty: string;
  questionTypes: string[];
  createdAt: string;
  dueDate: string;
  status: 'Generated' | 'Active';
}

const getFormattedDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const initialMockAssignments: Assignment[] = [];

export default function Home() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  // Dashboard states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showMobileProfileDropdown, setShowMobileProfileDropdown] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Filter & sort states
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'dueDate'>('newest');

  // Form states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: string }[]>([]);
  const [questionRows, setQuestionRows] = useState([
    { type: 'mcq', count: 4, marks: 1 },
    { type: 'short', count: 3, marks: 2 },
    { type: 'diagram', count: 5, marks: 5 },
    { type: 'numerical', count: 5, marks: 5 },
  ]);
  const [dueDate, setDueDate] = useState(getFormattedDate(1));
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [form, setForm] = useState({
    title: '',
    subject: 'Physics',
    points: 100,
    timeLimit: 60,
    difficulty: 'Medium',
    questionTypes: ['mcq'] as string[],
  });

  const addQuestionRow = () => {
    setQuestionRows([...questionRows, { type: 'mcq', count: 1, marks: 1 }]);
  };

  const updateRow = (index: number, field: 'type' | 'count' | 'marks', value: any) => {
    const next = [...questionRows];
    next[index] = { ...next[index], [field]: value };
    setQuestionRows(next);
  };

  const deleteRow = (index: number) => {
    setQuestionRows(questionRows.filter((_, i) => i !== index));
  };

  const totalQuestions = questionRows.reduce((sum, r) => sum + r.count, 0);
  const totalMarks = questionRows.reduce((sum, r) => sum + r.count * r.marks, 0);

  // Build subject list from user profile, with fallback defaults
  const FALLBACK_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'English Literature'];
  const subjectOptions = (user?.subjects && user.subjects.length > 0) ? user.subjects : FALLBACK_SUBJECTS;

  // Keep form.subject in sync when user's subjects change
  useEffect(() => {
    if (subjectOptions.length > 0) {
      setForm((prev) => ({
        ...prev,
        subject: subjectOptions.includes(prev.subject) ? prev.subject : subjectOptions[0],
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.subjects]);

  const generationSteps = [
    'Parsing reference materials...',
    'Structuring custom question paper schema...',
    'Generating questions using Veda AI model...',
    'Formulating answers and rubrics...',
    'Finalizing assignment output...',
  ];

  const fetchAssignments = async () => {
    const res = await api.listAssignments();
    if (res.success && res.data) {
      const mapped: Assignment[] = res.data.map((a: any) => ({
        id: a._id,
        title: a.title,
        subject: a.subject,
        points: a.totalMarks,
        timeLimit: a.timeLimit || 60,
        difficulty: a.difficulty,
        questionTypes: a.questionRows ? Array.from(new Set(a.questionRows.map((r: any) => r.type))) : [],
        createdAt: a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-GB').replace(/\//g, '-') : getFormattedDate(0),
        dueDate: a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-GB').replace(/\//g, '-') : getFormattedDate(1),
        status: a.status === 'completed' ? 'Generated' : 'Active',
      }));
      setAssignments(mapped);
    }
  };

  // Load assignments on mount
  useEffect(() => {
    if (user) {
      fetchAssignments();
    }
  }, [user]);

  // Listen to document click to close active dropdowns (3-dot menu + filter panel)
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuId(null);
      setShowFilterDropdown(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Helper: parse DD-MM-YYYY → timestamp for sorting (defined before early returns so useMemo is always called)
  const parseDate = (s: string) => {
    const [d, m, y] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  // Single-pass search + sort — O(n log n), memoized
  const filteredAssignments = useMemo(() => {
    const sq = searchQuery.toLowerCase();
    const filtered = sq
      ? assignments.filter((a) =>
          a.title.toLowerCase().includes(sq) || a.subject.toLowerCase().includes(sq)
        )
      : [...assignments];
    if (sortBy === 'oldest') return filtered.sort((a, b) => parseDate(a.createdAt) - parseDate(b.createdAt));
    if (sortBy === 'dueDate') return filtered.sort((a, b) => parseDate(a.dueDate) - parseDate(b.dueDate));
    return filtered.sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
  }, [assignments, searchQuery, sortBy]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-[#ff7a59]/20 border-t-[#ff7a59] animate-spin" />
      </div>
    );
  }

  // Handle Input Changes
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCheckboxChange = (type: string) => {
    if (form.questionTypes.includes(type)) {
      if (form.questionTypes.length > 1) {
        setForm({ ...form, questionTypes: form.questionTypes.filter((t) => t !== type) });
      }
    } else {
      setForm({ ...form, questionTypes: [...form.questionTypes, type] });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const list = Array.from(e.target.files).map((f) => ({
        name: f.name,
        size: (f.size / 1024).toFixed(1) + ' KB',
      }));
      setUploadedFiles([...uploadedFiles, ...list]);
    }
  };

  const triggerGeneration = async () => {
    if (!form.title.trim()) {
      alert('Please enter an assignment title.');
      return;
    }
    
    setIsGenerating(true);
    setGenerationStep(0);

    const payload = {
      title: form.title,
      subject: form.subject,
      difficulty: form.difficulty.toLowerCase() as "easy" | "medium" | "hard",
      timeLimit: Number(form.timeLimit),
      dueDate: dueDate,
      questionRows: questionRows,
      additionalInfo: additionalInfo,
    };

    const res = await api.generateAssignment(payload);
    if (!res.success || !res.data) {
      alert(res.error || 'Failed to start generation');
      setIsGenerating(false);
      return;
    }

    const { assignmentId } = res.data as any;

    if (!user) return;
    // Connect to websocket to listen for job progress and completion
    socketService.connect(process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080");
    
    // Subscribe to events for our user
    socketService.emit('subscribe', { userId: user._id });

    const unsubProgress = socketService.on('job:progress', (data: any) => {
      if (data.assignmentId === assignmentId) {
        setGenerationStep(data.step);
      }
    });

    const unsubDone = socketService.on('job:done', (data: any) => {
      if (data.assignmentId === assignmentId) {
        unsubProgress();
        unsubDone();
        unsubFailed();
        setIsGenerating(false);
        setShowCreateModal(false);
        
        // Reset form
        setForm({
          title: '',
          subject: 'Physics',
          points: 100,
          timeLimit: 60,
          difficulty: 'Medium',
          questionTypes: ['mcq'],
        });
        setQuestionRows([
          { type: 'mcq', count: 4, marks: 1 },
          { type: 'short', count: 3, marks: 2 },
          { type: 'diagram', count: 5, marks: 5 },
          { type: 'numerical', count: 5, marks: 5 },
        ]);
        setDueDate(getFormattedDate(1));
        setAdditionalInfo('');
        setUploadedFiles([]);
        
        router.push(`/output/${assignmentId}`);
      }
    });

    const unsubFailed = socketService.on('job:failed', (data: any) => {
      if (data.assignmentId === assignmentId) {
        unsubProgress();
        unsubDone();
        unsubFailed();
        setIsGenerating(false);
        alert(data.error || 'Generation failed.');
      }
    });
  };

  const handleDeleteAssignment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = confirm('Are you sure you want to delete this assignment?');
    if (confirmed) {
      const res = await api.deleteAssignment(id);
      if (res.success) {
        fetchAssignments();
      } else {
        alert(res.error || 'Failed to delete assignment');
      }
      setActiveMenuId(null);
    }
  };



  // -------------------------------------------------------------
  // RENDER GUEST MARKETING LANDING PAGE
  // -------------------------------------------------------------
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-100 text-zinc-900 flex flex-col justify-between selection:bg-[#ff7a59] selection:text-white font-sans">
        {/* Header */}
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center font-extrabold text-xl text-white shadow-md">
              V
            </div>
            <span className="font-extrabold text-xl tracking-tight text-zinc-900">
              VedaAI
            </span>
          </div>
          <nav className="flex items-center">
            <Link
              href="/login"
              className="px-6 py-2.5 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 rounded-full transition-all duration-200 text-white shadow-md cursor-pointer border border-zinc-900 active:scale-98"
            >
              Sign In
            </Link>
          </nav>
        </header>

        {/* Main Hero / Dashboard Area */}
        <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#ff7a59]/10 border border-[#ff7a59]/20 text-[#ff7a59] text-xs font-bold mb-6 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff7a59] animate-pulse" />
            Smart Assessment Platform Active
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 text-zinc-900">
            Automated Question & <br />
            <span className="text-[#ff7a59]">Assignment Generator</span>
          </h1>

          <p className="text-zinc-550 text-base md:text-lg max-w-2xl mb-12 leading-relaxed font-semibold">
            Create comprehensive, tailored question papers, grade assignments, and get detailed feedback powered by Veda AI. Upload materials and customize your criteria.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left mb-12">
            {/* Card 1: Coral Theme */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-[#ff7a59]/40 hover:shadow-md transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-[#ff7a59]/10 border border-[#ff7a59]/20 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-[#ff7a59]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-extrabold text-zinc-900 mb-2">Assignment Form</h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-semibold">Configure parameters, select types, difficulty, and generate custom question papers.</p>
            </div>

            {/* Card 2: Purple Theme */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-purple-500/40 hover:shadow-md transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <h3 className="font-extrabold text-zinc-900 mb-2">Upload Section</h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-semibold">Process syllabus materials, reference textbooks, or student submissions seamlessly.</p>
            </div>

            {/* Card 3: Teal Theme */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-teal-500/40 hover:shadow-md transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-extrabold text-zinc-900 mb-2">Real-time Sync</h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-semibold">Active WebSocket communication for live generation progress and feedback stream.</p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-200/80 py-6 text-center text-xs text-zinc-450 font-semibold bg-white/40">
          &copy; {new Date().getFullYear()} Veda AI. Ready to customize components.
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER AUTHENTICATED USER DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-zinc-100 flex text-zinc-900 font-sans selection:bg-[#ff7a59] selection:text-white">
      {/* Sidebar — hidden on mobile, visible on md+ */}
      <div className="hidden md:flex">
        <Sidebar activeItem="home" />
      </div>

      {/* Main Container - Right side */}
      <div className="flex-1 flex flex-col min-w-0">        {showCreateModal ? (
          <>
            {/* Desktop header for Create Assignment flow */}
            <div className="hidden md:block">
              <Header title="Home" showBackButton={true} onBackClick={() => { setShowCreateModal(false); setUploadedFiles([]); }} />
            </div>

            {/* Mobile top bar for Create Assignment flow */}
            <header className="flex md:hidden items-center justify-between mx-4 mt-4 mb-2 px-4 py-3 bg-white border border-zinc-200/60 rounded-[24px] shadow-sm sticky top-4 z-30">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setUploadedFiles([]);
                  }}
                  className="p-1.5 hover:bg-zinc-55 hover:text-zinc-700 rounded-lg transition-colors cursor-pointer text-zinc-500"
                  aria-label="Go back"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <span className="font-extrabold text-zinc-900 text-lg tracking-tight">Home</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="relative w-10 h-10 rounded-full bg-zinc-50 border border-zinc-100 flex items-center justify-center transition-colors hover:bg-zinc-100" aria-label="Notifications">
                  <svg className="w-5 h-5 text-zinc-850" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#ff7a59] rounded-full border border-white" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowMobileProfileDropdown(!showMobileProfileDropdown)}
                    className="w-10 h-10 rounded-full overflow-hidden border border-zinc-200 shadow-xs flex items-center justify-center flex-shrink-0 cursor-pointer"
                    aria-label="Profile"
                  >
                    {user?.profilePic ? (
                      <img src={user.profilePic} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-orange-50 flex items-center justify-center font-extrabold text-[#ff7a59] text-sm">
                        {user?.fullName ? user.fullName.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase() : user?.username?.substring(0, 2).toUpperCase() || 'U'}
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </header>
          </>
        ) : (
          <>
            {/* Standard Dashboard Mobile Header */}
            <header className="flex md:hidden items-center justify-between mx-4 mt-4 mb-2 px-4 py-3 bg-white border border-zinc-200/60 rounded-[24px] shadow-sm sticky top-4 z-30">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center font-extrabold text-white text-base shadow-sm">
                  V
                </div>
                <span className="font-extrabold text-zinc-900 text-lg tracking-tight">VedaAI</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="relative w-10 h-10 rounded-full bg-zinc-50 border border-zinc-100 flex items-center justify-center transition-colors hover:bg-zinc-100" aria-label="Notifications">
                  <svg className="w-5 h-5 text-zinc-850" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#ff7a59] rounded-full border border-white" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowMobileProfileDropdown(!showMobileProfileDropdown)}
                    className="w-10 h-10 rounded-full overflow-hidden border border-zinc-200 shadow-xs flex items-center justify-center flex-shrink-0 cursor-pointer"
                    aria-label="Profile"
                  >
                    {user?.profilePic ? (
                      <img src={user.profilePic} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-orange-50 flex items-center justify-center font-extrabold text-[#ff7a59] text-sm">
                        {user?.fullName ? user.fullName.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase() : user?.username?.substring(0, 2).toUpperCase() || 'U'}
                      </div>
                    )}
                  </button>
                  {showMobileProfileDropdown && (
                    <div className="absolute right-0 mt-2 w-52 bg-white border border-zinc-200 rounded-2xl shadow-xl py-2 z-50 animate-fadeIn">
                      <div className="px-4 py-2.5 border-b border-zinc-100">
                        <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Signed in as</p>
                        <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
                        {user?.fullName && (
                          <p className="text-xs font-semibold text-zinc-700 truncate mt-0.5">@{user?.username}</p>
                        )}
                      </div>
                      <Link
                        href="/settings"
                        onClick={() => setShowMobileProfileDropdown(false)}
                        className="px-4 py-2 text-xs font-semibold text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 flex items-center gap-2 transition-colors"
                      >
                        <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>Account Settings</span>
                      </Link>
                      <button
                        onClick={() => {
                          logout();
                          setShowMobileProfileDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer border-none bg-transparent"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="p-1 text-zinc-900 hover:text-zinc-650 transition-colors cursor-pointer"
                  aria-label="Menu"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </header>

            {/* Desktop header (hidden on mobile) */}
            <div className="hidden md:block">
              <Header title="Home" showBackButton={false} />
            </div>
          </>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto relative pb-24 md:pb-8">
          {showCreateModal ? (
            isGenerating ? (
              /* Generation progress state loader */
              <div className="h-full flex flex-col items-center justify-center py-20 text-center max-w-lg mx-auto">
                <div className="relative w-20 h-20 mb-8">
                  <div className="absolute inset-0 rounded-full border-4 border-orange-50 border-t-[#ff7a59] animate-spin" />
                </div>
                <h3 className="text-lg font-bold text-zinc-800 mb-2">Generating with Veda AI</h3>
                <p className="text-xs text-[#ff7a59] font-semibold animate-pulse">{generationSteps[generationStep]}</p>
                
                {/* Visual indicator bar */}
                <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden mt-6">
                  <div
                    className="h-full bg-[#ff7a59] transition-all duration-300"
                    style={{ width: `${((generationStep + 1) / generationSteps.length) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              /* Full Page Form matching user specifications */
              <div className="pb-16 max-w-4xl mx-auto">
                {/* Header with green dot */}
                <div className="mb-6 flex items-start gap-3 relative z-10 px-1">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white ring-2 ring-emerald-500/20 mt-1 flex-shrink-0" />
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">Create Assignment</h1>
                    <p className="text-xs text-zinc-400 mt-0.5">Set up a new assignment for your students</p>
                  </div>
                </div>

                {/* Progress segment indicator */}
                <div className="mb-8 flex gap-3 px-1">
                  <div className="h-1.5 flex-1 bg-[#ff7a59] rounded-full" />
                  <div className="h-1.5 flex-1 bg-zinc-250 rounded-full" />
                </div>

                <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-8 relative z-10">
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900 mb-1">Assignment Details</h2>
                    <p className="text-xs text-zinc-400">Basic information about your assignment</p>
                  </div>

                  {/* File Upload Area */}
                  <div>
                    <div className="relative border border-dashed border-zinc-200 rounded-2xl p-8 hover:bg-zinc-50 transition-colors cursor-pointer flex flex-col items-center justify-center text-center">
                      <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="w-12 h-12 rounded-full bg-zinc-50 border border-zinc-100 flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-zinc-650" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <span className="text-xs font-bold text-zinc-900 mb-1">Choose a file or drag & drop it here</span>
                      <span className="text-[10px] text-zinc-450">JPEG, PNG, upto 10MB</span>
                      
                      {/* Browse Files Pill */}
                      <span className="mt-4 px-5 py-2 bg-zinc-100 hover:bg-zinc-200/80 text-zinc-800 font-bold rounded-full text-[10px] transition-colors cursor-pointer">
                        Browse Files
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 text-center mt-2">Upload images of your preferred document/image</p>
                    
                    {/* Uploaded Files list */}
                    {uploadedFiles.length > 0 && (
                      <div className="mt-3 space-y-1.5 max-w-md mx-auto">
                        {uploadedFiles.map((file, i) => (
                          <div key={i} className="flex items-center justify-between p-2.5 bg-orange-50 border border-orange-100 rounded-xl text-xs">
                            <span className="font-bold text-[#ff7a59] truncate max-w-64">{file.name}</span>
                            <span className="text-[#ff7a59]/70 flex-shrink-0">{file.size}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assignment Title */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                      Assignment Title
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={form.title}
                      onChange={handleFormChange}
                      placeholder="e.g. Quiz on DSA"
                      required
                      className="w-full bg-zinc-50 border border-zinc-200 hover:border-zinc-300 focus:outline-hidden focus:border-[#ff7a59] focus:ring-2 focus:ring-[#ff7a59]/10 rounded-2xl px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition-all font-medium"
                    />
                  </div>


                  {/* Due Date Picker */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                      Due Date
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        placeholder="DD-MM-YYYY"
                        className="w-full bg-zinc-50 border border-zinc-200 hover:border-zinc-300 focus:outline-hidden focus:border-[#ff7a59] focus:ring-2 focus:ring-[#ff7a59]/10 rounded-2xl pl-4 pr-10 py-3 text-sm text-zinc-900 transition-all font-medium"
                      />
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-zinc-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  {/* Question Types List */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-12 gap-4 border-b border-zinc-150 pb-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      <span className="col-span-6">Question Type</span>
                      <span className="col-span-3 text-center">No. of Questions</span>
                      <span className="col-span-3 text-center">Marks</span>
                    </div>

                    <div className="space-y-3">
                      {questionRows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-4 items-center">
                          {/* Question type select */}
                          <div className="col-span-5 relative">
                            <select
                              value={row.type}
                              onChange={(e) => updateRow(idx, 'type', e.target.value)}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-hidden focus:border-[#ff7a59] cursor-pointer font-semibold"
                            >
                              <option value="mcq">Multiple Choice Questions</option>
                              <option value="short">Short Questions</option>
                              <option value="diagram">Diagram/Graph-Based Questions</option>
                              <option value="numerical">Numerical Problems</option>
                            </select>
                          </div>
                          {/* Delete row */}
                          <div className="col-span-1 flex justify-center">
                            <button
                              type="button"
                              onClick={() => deleteRow(idx)}
                              className="text-zinc-450 hover:text-red-500 transition-colors p-1 cursor-pointer"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {/* Count adjustment */}
                          <div className="col-span-3 flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1">
                            <button
                              type="button"
                              onClick={() => updateRow(idx, 'count', Math.max(1, row.count - 1))}
                              className="text-zinc-400 hover:text-zinc-700 font-bold px-1 text-sm cursor-pointer"
                            >
                              —
                            </button>
                            <span className="text-xs font-bold text-zinc-800">{row.count}</span>
                            <button
                              type="button"
                              onClick={() => updateRow(idx, 'count', row.count + 1)}
                              className="text-zinc-400 hover:text-zinc-700 font-bold px-1 text-sm cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                          {/* Marks adjustment */}
                          <div className="col-span-3 flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1">
                            <button
                              type="button"
                              onClick={() => updateRow(idx, 'marks', Math.max(1, row.marks - 1))}
                              className="text-zinc-400 hover:text-zinc-700 font-bold px-1 text-sm cursor-pointer"
                            >
                              —
                            </button>
                            <span className="text-xs font-bold text-zinc-800">{row.marks}</span>
                            <button
                              type="button"
                              onClick={() => updateRow(idx, 'marks', row.marks + 1)}
                              className="text-zinc-400 hover:text-zinc-700 font-bold px-1 text-sm cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add row / Totals row */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-3 border-t border-zinc-100">
                      <button
                        type="button"
                        onClick={addQuestionRow}
                        className="flex items-center gap-3 hover:opacity-85 transition-opacity cursor-pointer select-none"
                      >
                        <div className="w-9 h-9 rounded-full bg-[#222222] flex items-center justify-center text-white text-xl font-light pb-0.5">
                          +
                        </div>
                        <span className="font-extrabold text-[#222222] text-sm tracking-tight">Add Question Type</span>
                      </button>
                      <div className="flex flex-col text-right text-xs font-bold text-zinc-500 gap-1 select-none pr-1">
                        <span>Total Questions : {totalQuestions}</span>
                        <span>Total Marks : {totalMarks}</span>
                      </div>
                    </div>
                  </div>

                  {/* Additional Information */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                      Additional Information (For better output)
                    </label>
                    <div className="relative">
                      <textarea
                        value={additionalInfo}
                        onChange={(e) => setAdditionalInfo(e.target.value)}
                        placeholder="e.g. Generate a question paper for 3 hour exam duration..."
                        className="w-full bg-zinc-50 border border-zinc-200 hover:border-zinc-300 focus:outline-hidden focus:border-[#ff7a59] focus:ring-2 focus:ring-[#ff7a59]/10 rounded-2xl px-4 py-3 pb-10 text-sm text-zinc-900 placeholder-zinc-400 transition-all font-medium min-h-24 resize-none"
                      />
                      <button
                        type="button"
                        className="absolute bottom-3 right-3.5 text-zinc-400 hover:text-zinc-700 p-1.5 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer"
                        aria-label="Voice input"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom navigation buttons */}
                <div className="mt-8 flex justify-between items-center px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setUploadedFiles([]);
                    }}
                    className="px-6 py-3 border border-zinc-200 hover:bg-zinc-50 text-zinc-500 font-bold rounded-full text-xs transition-colors cursor-pointer shadow-xs"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    onClick={triggerGeneration}
                    className="px-8 py-3.5 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-full text-xs transition-colors cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <span>Next</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            )
          ) : (
            assignments.length === 0 ? (
              /* EMPTY STATE VIEW matching image */
              <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto py-12">
                <svg className="w-60 h-60 md:w-80 md:h-80 mx-auto mb-0" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Circular light background pattern */}
                  <circle cx="100" cy="100" r="88" fill="#f4f4f5" opacity="0.65"/>
                  
                  {/* White spotlight circle behind everything */}
                  <circle cx="106" cy="90" r="64" fill="#ffffff" />

                  {/* Squiggly loop background (exact mathematical curve match) */}
                  <path d="M 28,85 C 50,70 65,45 50,45 C 35,45 35,70 55,62 C 68,56 75,44 86,38" stroke="#0a192f" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85" />

                  {/* Sheet of Paper */}
                  <rect x="80" y="46" width="56" height="76" rx="10" fill="#ffffff" stroke="#f4f4f5" strokeWidth="1" filter="drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.06))" />
                  <line x1="90" y1="58" x2="114" y2="58" stroke="#031726" strokeWidth="6.5" strokeLinecap="round" />
                  <line x1="90" y1="72" x2="126" y2="72" stroke="#d4d4d8" strokeWidth="6.5" strokeLinecap="round" />
                  <line x1="90" y1="86" x2="126" y2="86" stroke="#d4d4d8" strokeWidth="6.5" strokeLinecap="round" />
                  <line x1="90" y1="100" x2="126" y2="100" stroke="#d4d4d8" strokeWidth="6.5" strokeLinecap="round" />
                  <line x1="90" y1="114" x2="126" y2="114" stroke="#d4d4d8" strokeWidth="6.5" strokeLinecap="round" />

                  {/* Small card/pill (top-right) */}
                  <rect x="138" y="38" width="34" height="20" rx="5" fill="#ffffff" stroke="#f4f4f5" strokeWidth="1" filter="drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.04))" />
                  <circle cx="146" cy="48" r="3.5" fill="#cac5df" />
                  <rect x="153" y="45.5" width="13" height="5" rx="2.5" fill="#d4d4d8" />

                  {/* Blue dot */}
                  <circle cx="162" cy="105" r="4.5" fill="#4682b4" />

                  {/* 4-point Star (bottom-left) */}
                  <path d="M68 120c0 3.5-1.2 4.8-4.8 4.8 3.6 0 4.8 1.2 4.8 4.8 0-3.6 1.2-4.8 4.8-4.8-3.6 0-4.8-1.2-4.8-4.8z" fill="#4682b4" />

                  {/* Magnifying Glass */}
                  {/* Handle */}
                  <path d="M132 115L154 137" stroke="#cac5df" strokeWidth="10.5" strokeLinecap="round" />
                  {/* Lens base - semi-transparent white fill for overlay effect */}
                  <circle cx="114" cy="97" r="26" stroke="#cac5df" strokeWidth="6.5" fill="#ffffff" fillOpacity="0.4" />

                  {/* Red X inside lens */}
                  <path d="M104 87L124 107M124 87L104 107" stroke="#ff4444" strokeWidth="6" strokeLinecap="round" />
                </svg>

                <h2 className="text-xl font-bold tracking-tight text-zinc-900 mb-1.5">
                  No assignments yet
                </h2>
                <p className="text-zinc-550 text-xs max-w-sm mb-4 leading-relaxed font-semibold">
                  Create your first assignment to start collecting and grading student submissions. You can set up rubrics, define marking criteria, and let AI assist with grading.
                </p>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 py-3 px-6 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-full shadow-md active:scale-98 transition-all duration-200 cursor-pointer text-xs"
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Create Your First Assignment</span>
                </button>
              </div>
            ) : (
              /* ASSIGNMENTS POPULATED STATE MATCHING USER IMAGE */
              <div className="pb-16">
                {/* Title Header with green dot */}
                <div className="mb-6 flex items-start gap-3 relative z-10">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white ring-2 ring-emerald-500/20 mt-1.5 animate-pulse flex-shrink-0" />
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">Assignments</h1>
                    <p className="text-xs text-zinc-400 mt-0.5">Manage and create assignments for your classes.</p>
                  </div>
                </div>

                {/* Filter and Search Bar Container */}
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6 bg-white border border-zinc-200 rounded-2xl p-3 shadow-xs relative z-20">
                  {/* Filter By Button */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                        setShowFilterDropdown((v) => !v);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        showFilterDropdown || sortBy !== 'newest'
                          ? 'bg-zinc-950 text-white border-zinc-950'
                          : 'text-zinc-500 border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      <span>Filter By</span>
                      {sortBy !== 'newest' && (
                        <span className="w-2 h-2 rounded-full bg-[#ff7a59]" />
                      )}
                    </button>

                    {/* Sort-only Dropdown */}
                    {showFilterDropdown && (
                      <div
                        onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                        className="absolute left-0 top-full mt-2 w-52 bg-white border border-zinc-200 rounded-2xl shadow-xl z-[200] p-3"
                        style={{ animation: 'fadeInScale 0.12s ease-out' }}
                      >
                        <p className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-2 px-1">Sort By</p>
                        <div className="flex flex-col gap-0.5">
                          {([['newest', 'Newest First'], ['oldest', 'Oldest First'], ['dueDate', 'Due Date']] as const).map(([val, label]) => (
                            <button
                              key={val}
                              onClick={() => { setSortBy(val); setShowFilterDropdown(false); }}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                                sortBy === val ? 'bg-zinc-100 text-zinc-900 font-bold' : 'text-zinc-500 hover:bg-zinc-50'
                              }`}
                            >
                              <span>{label}</span>
                              {sortBy === val && (
                                <svg className="w-3.5 h-3.5 text-[#ff7a59]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Search */}
                  <div className="relative w-full sm:w-72">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-zinc-400">
                      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search Assignment"
                      className="w-full bg-zinc-50 border border-zinc-200 hover:border-zinc-300 focus:outline-hidden focus:border-[#ff7a59] focus:ring-2 focus:ring-[#ff7a59]/10 rounded-full pl-10 pr-4 py-2 text-xs text-zinc-900 placeholder-zinc-400 transition-all font-semibold"
                    />
                  </div>
                </div>

                {/* Grid Layout (2 columns matching image) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
                  {filteredAssignments.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => router.push(`/output/${item.id}`)}
                      className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-xs hover:shadow-md hover:border-zinc-300 transition-all duration-200 relative group flex flex-col justify-between min-h-40 cursor-pointer"
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          {/* Title: e.g. Quiz on Electricity */}
                          <h3 className="text-lg font-bold text-zinc-900 group-hover:text-[#ff7a59] transition-colors pr-2">
                            {item.title}
                          </h3>

                          {/* 3-dot Action Menu button */}
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.nativeEvent.stopImmediatePropagation();
                                setActiveMenuId(activeMenuId === item.id ? null : item.id);
                              }}
                              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                                activeMenuId === item.id
                                  ? 'text-zinc-800 bg-zinc-100'
                                  : 'text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100'
                              }`}
                              aria-label="More options"
                            >
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="5" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="19" r="1.5" />
                              </svg>
                            </button>

                            {/* Dropdown menu */}
                            {activeMenuId === item.id && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.nativeEvent.stopImmediatePropagation();
                                }}
                                className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-zinc-200/80 rounded-2xl shadow-lg overflow-hidden z-[100]"
                                style={{ animation: 'fadeInScale 0.12s ease-out' }}
                              >
                                <Link
                                  href={`/output/${item.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full text-left px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  <span>View Assignment</span>
                                </Link>
                                <div className="mx-3 border-t border-zinc-100" />
                                <button
                                  onClick={(e) => handleDeleteAssignment(item.id, e)}
                                  className="w-full text-left px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-405 mt-0.5">Subject: {item.subject} • {item.points} Points • {item.timeLimit} Mins</p>
                      </div>

                      {/* Bottom row: Assigned and Due dates */}
                      <div className="flex justify-between items-center text-xs border-t border-zinc-100 pt-3 text-zinc-500">
                        <div>
                          <span className="font-bold text-zinc-700">Assigned on : </span>
                          <span>{item.createdAt}</span>
                        </div>
                        <div>
                          <span className="font-bold text-zinc-700">Due : </span>
                          <span>{item.dueDate}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop floating bottom button — hidden on mobile */}
                <div className="hidden md:flex fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 py-3 px-6 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-full border border-zinc-800 shadow-xl active:scale-98 transition-all duration-200 cursor-pointer text-xs"
                  >
                    <svg className="w-4 h-4 text-orange-450" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Create Assignment</span>
                  </button>
                </div>
              </div>
            )
          )}
        </main>

        {/* ── MOBILE BOTTOM NAV ── */}
        <nav className="flex md:hidden fixed bottom-4 left-4 right-4 z-40 bg-[#121212] border border-zinc-800/50 rounded-[28px] py-2.5 px-3 shadow-2xl items-center justify-around">
          {[
            {
              label: 'Home', active: true,
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="7" height="7" rx="2" />
                  <rect x="14" y="3" width="7" height="7" rx="2" />
                  <rect x="3" y="14" width="7" height="7" rx="2" />
                  <rect x="14" y="14" width="7" height="7" rx="2" />
                </svg>
              ),
            },
            {
              label: 'Assignments', active: false,
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="5" width="16" height="14" rx="4" />
                  <rect x="8" y="9" width="8" height="2.5" rx="1.25" fill="#121212" />
                  <rect x="14" y="14" width="3" height="2" rx="1" fill="#121212" />
                </svg>
              ),
            },
            {
              label: 'Library', active: false,
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z" />
                  <path d="M11 11h2v3h3v2h-3v3h-2v-3H8v-2h3v-3z" fill="#121212" />
                </svg>
              ),
            },
            {
              label: 'AI Toolkit', active: false,
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 3c0 3.5-2.5 6-6 6 3.5 0 6 2.5 6 6 0-3.5 2.5-6 6-6-3.5 0-6-2.5-6-6z" />
                  <path d="M18 11c0 2-1.5 3.5-3.5 3.5 2 0 3.5 1.5 3.5 3.5 0-2 1.5-3.5 3.5-3.5-2 0-3.5-1.5-3.5-3.5z" />
                </svg>
              ),
            },
          ].map(({ label, active, icon }) => (
            <button
              key={label}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
                active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <div className={active ? 'text-white' : 'text-zinc-650'}>
                {icon}
              </div>
              <span className="tracking-wide">{label}</span>
            </button>
          ))}
        </nav>

        {/* Mobile FAB — always visible on mobile */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="md:hidden fixed bottom-24 right-6 z-40 w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer border-none"
          aria-label="Create assignment"
        >
          <svg className="w-7 h-7 text-[#ff7a59]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M12 4v16m8-8H4" />
          </svg>
        </button>

      </div>



      {/* Mobile Sidebar drawer overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          {/* Sidebar container */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white h-full shadow-2xl transition-transform duration-300 ease-out z-10">
            {/* Close Button inside drawer */}
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-zinc-800 transition-colors z-20 cursor-pointer"
              aria-label="Close menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* Sidebar component inside drawer */}
            <div className="h-full overflow-y-auto">
              <Sidebar activeItem="home" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
