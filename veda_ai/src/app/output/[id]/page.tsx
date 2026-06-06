'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import DifficultyBadge, { Difficulty } from '@/components/DifficultyBadge';
import { socketService } from '@/services/socket';
import { useAuth } from '@/context/AuthContext';

interface Question {
  text: string;
  type: string;
  difficulty: string;
  marks: number;
  options?: string[];
}

interface Section {
  title: string;
  instruction: string;
  questions: Question[];
}

interface AssignmentData {
  _id: string;
  title: string;
  subject: string;
  difficulty: string;
  timeLimit: number;
  totalMarks: number;
  totalQuestions: number;
  sections?: Section[];
  dueDate?: string;
  status: string;
  additionalInfo?: string;
  questionRows?: any[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OutputPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [assignment, setAssignment] = useState<AssignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);

  // Student info state
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [section, setSection] = useState('');

  const generationSteps = [
    'Parsing reference materials...',
    'Structuring custom question paper schema...',
    'Generating questions using Veda AI model...',
    'Formulating answers and rubrics...',
    'Finalizing assignment output...',
  ];

  const fetchAssignment = async () => {
    setLoading(true);
    setError(null);
    const res = await api.getAssignmentById(id);
    if (res.success && res.data) {
      setAssignment(res.data as any);
    } else {
      setError(res.error || 'Failed to load assignment');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssignment();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  const handleRegenerate = async () => {
    if (!assignment) return;
    const confirmed = confirm('Are you sure you want to regenerate this question paper? This will overwrite the current questions.');
    if (!confirmed) return;

    setIsRegenerating(true);
    setGenerationStep(0);

    const payload = {
      title: assignment.title,
      subject: assignment.subject,
      difficulty: assignment.difficulty.toLowerCase() as "easy" | "medium" | "hard",
      timeLimit: Number(assignment.timeLimit),
      dueDate: assignment.dueDate || '',
      questionRows: assignment.questionRows || [
        { type: 'mcq', count: 4, marks: 1 },
        { type: 'short', count: 3, marks: 2 }
      ],
      additionalInfo: assignment.additionalInfo || '',
    };

    const res = await api.generateAssignment(payload);
    if (!res.success || !res.data) {
      alert(res.error || 'Failed to start regeneration');
      setIsRegenerating(false);
      return;
    }

    const { assignmentId } = res.data as any;

    if (!user) return;
    socketService.connect(process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080");
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
        setIsRegenerating(false);
        router.push(`/output/${assignmentId}`);
      }
    });

    const unsubFailed = socketService.on('job:failed', (data: any) => {
      if (data.assignmentId === assignmentId) {
        unsubProgress();
        unsubDone();
        unsubFailed();
        setIsRegenerating(false);
        alert(data.error || 'Regeneration failed.');
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100">
        <div className="w-10 h-10 rounded-full border-4 border-t-[#ff7a59] border-zinc-800 animate-spin mb-4" />
        <p className="text-zinc-400 text-sm font-semibold">Loading generated assessment...</p>
      </div>
    );
  }

  if (isRegenerating) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center py-20 text-center max-w-lg mx-auto">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-orange-50 border-t-[#ff7a59] animate-spin" />
        </div>
        <h3 className="text-lg font-bold text-zinc-100 mb-2">Regenerating with Veda AI</h3>
        <p className="text-xs text-[#ff7a59] font-semibold animate-pulse">{generationSteps[generationStep]}</p>
        
        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-6">
          <div
            className="h-full bg-[#ff7a59] transition-all duration-300"
            style={{ width: `${((generationStep + 1) / generationSteps.length) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100 p-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 text-red-400">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Error Loading Assignment</h2>
        <p className="text-zinc-550 max-w-md text-center text-sm mb-6">{error || 'The requested assignment could not be loaded.'}</p>
        <Link href="/" className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-full text-xs transition-colors">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  // Calculate sum of question count if sections array is present
  const totalQuestionsList = assignment.sections
    ? assignment.sections.reduce((sum, s) => sum + s.questions.length, 0)
    : assignment.totalQuestions;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-[#ff7a59] selection:text-white print:bg-white print:text-black">
      {/* Action Bar (Hidden during print) */}
      <header className="no-print border-b border-zinc-800/60 bg-zinc-900/40 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center font-bold text-lg text-white hover:text-[#ff7a59] transition-colors border border-zinc-700/50">
            V
          </Link>
          <span className="font-semibold text-sm tracking-tight text-zinc-200">
            Veda AI / Assessment Output
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRegenerate}
            className="px-4 py-2 border border-zinc-800 hover:bg-zinc-900 text-zinc-350 hover:text-white font-bold rounded-full text-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
            </svg>
            <span>Regenerate</span>
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 bg-[#ff7a59] hover:bg-[#ff7a59]/90 text-white font-bold rounded-full text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#ff7a59]/20"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Download PDF</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 print:p-0 print:max-w-none">
        
        {/* Breadcrumb info (Hidden during print) */}
        <div className="no-print mb-6">
          <Link href="/" className="text-xs text-zinc-500 hover:text-[#ff7a59] transition-colors flex items-center gap-1">
            ← Back to Dashboard
          </Link>
        </div>

        {/* The Exam Paper Wrapper */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 backdrop-blur-md rounded-3xl p-8 md:p-12 print:bg-transparent print:border-none print:p-0 space-y-8">
          
          {/* Formal School Header */}
          <div className="text-center pb-6 border-b border-dashed border-zinc-850 print:border-zinc-300">
            <h1 className="text-xl font-bold uppercase tracking-widest text-zinc-100 print:text-black">
              {assignment.subject} Examination
            </h1>
            <p className="text-xs text-zinc-450 uppercase tracking-wider mt-1 print:text-zinc-600">
              Veda AI Academic Assessment Companion
            </p>
            <div className="mt-4 text-sm font-semibold text-zinc-250 flex flex-wrap justify-center gap-x-8 gap-y-1 print:text-black">
              <span><strong>Assessment:</strong> {assignment.title}</span>
              <span><strong>Time Allowed:</strong> {assignment.timeLimit} Mins</span>
              <span><strong>Max Marks:</strong> {assignment.totalMarks}</span>
            </div>
          </div>

          {/* Student Info Fields */}
          <div className="p-6 rounded-2xl bg-zinc-950/50 border border-zinc-850/80 print:bg-transparent print:border-zinc-300 print:p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider print:text-zinc-750">
                Student Name
              </label>
              <input
                type="text"
                placeholder="Enter Student Name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="bg-zinc-900/40 border border-zinc-800 focus:outline-hidden focus:border-[#ff7a59] rounded-xl px-3 py-2 text-xs text-zinc-100 font-medium print:bg-transparent print:border-none print:border-b print:border-black print:rounded-none print:px-0 print:py-0.5"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider print:text-zinc-750">
                Roll Number
              </label>
              <input
                type="text"
                placeholder="Enter Roll Number"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                className="bg-zinc-900/40 border border-zinc-800 focus:outline-hidden focus:border-[#ff7a59] rounded-xl px-3 py-2 text-xs text-zinc-100 font-medium print:bg-transparent print:border-none print:border-b print:border-black print:rounded-none print:px-0 print:py-0.5"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider print:text-zinc-750">
                Class Section
              </label>
              <input
                type="text"
                placeholder="Enter Section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="bg-zinc-900/40 border border-zinc-800 focus:outline-hidden focus:border-[#ff7a59] rounded-xl px-3 py-2 text-xs text-zinc-100 font-medium print:bg-transparent print:border-none print:border-b print:border-black print:rounded-none print:px-0 print:py-0.5"
              />
            </div>
          </div>

          {/* Exam Instructions */}
          <div className="text-xs text-zinc-400 leading-relaxed space-y-1.5 border-b border-zinc-850 pb-6 print:border-zinc-300 print:text-zinc-800">
            <h4 className="font-bold uppercase tracking-wider text-zinc-300 print:text-black">General Instructions:</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Write your Name, Roll Number, and Section clearly in the spaces provided above.</li>
              <li>Attempt all sections and questions as specified in the instructions.</li>
              <li>This question paper contains {totalQuestionsList} questions across {assignment.sections?.length || 0} sections.</li>
              <li>Read all instructions carefully before writing answers.</li>
            </ul>
          </div>

          {/* Question Paper Sections */}
          <div className="space-y-10">
            {assignment.sections && assignment.sections.length > 0 ? (
              assignment.sections.map((section, sIdx) => (
                <div key={sIdx} className="space-y-6">
                  {/* Section Title & Header */}
                  <div className="pb-2 border-b border-zinc-800 print:border-zinc-300 flex items-center justify-between">
                    <h2 className="text-base font-bold uppercase tracking-wide text-zinc-200 print:text-black">
                      {section.title}
                    </h2>
                    <span className="text-[10px] font-mono text-zinc-500 print:text-zinc-800 italic">
                      {section.instruction}
                    </span>
                  </div>

                  {/* Section Questions */}
                  <div className="space-y-6">
                    {section.questions.map((question, qIdx) => (
                      <div key={qIdx} className="p-5 rounded-xl bg-zinc-950/40 border border-zinc-850/60 print:bg-transparent print:border-none print:p-0 flex gap-4 items-start break-inside-avoid">
                        <div className="text-xs font-mono bg-zinc-800 text-zinc-300 w-6 h-6 rounded-md flex items-center justify-center shrink-0 print:border print:border-black print:bg-transparent print:text-black">
                          Q{qIdx + 1}
                        </div>
                        <div className="space-y-3 flex-1">
                          <div className="flex justify-between items-start gap-4">
                            <p className="text-sm text-zinc-200 font-medium leading-relaxed print:text-black">
                              {question.text}
                            </p>
                            <span className="text-[10px] font-mono text-zinc-400 shrink-0 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-md print:bg-transparent print:border-none print:text-black print:font-bold">
                              {question.marks} {question.marks === 1 ? 'Mark' : 'Marks'}
                            </span>
                          </div>

                          {/* MCQ Options */}
                          {question.options && question.options.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-2 mt-2">
                              {question.options.map((opt, oIdx) => (
                                <div key={oIdx} className="text-xs text-zinc-400 font-medium flex items-center gap-2 print:text-black">
                                  <span className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-bold print:border-black print:bg-transparent">
                                    {String.fromCharCode(65 + oIdx)}
                                  </span>
                                  <span>{opt.replace(/^[A-D]\.\s*/, '')}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Badge tag (Hidden during print) */}
                          <div className="no-print flex items-center justify-between pt-1 border-t border-zinc-900/60 mt-2">
                            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                              Type: {question.type || 'Standard'}
                            </span>
                            <DifficultyBadge difficulty={question.difficulty.toLowerCase() as Difficulty} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-zinc-500 text-sm text-center">No sections generated for this paper.</p>
            )}
          </div>

        </div>
      </main>

      {/* Footer (Hidden during print) */}
      <footer className="no-print border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        &copy; {new Date().getFullYear()} Veda AI Assessment Creator. All Rights Reserved.
      </footer>
    </div>
  );
}
