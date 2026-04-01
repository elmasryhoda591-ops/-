/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Moon, Sun, Plus, Settings, MessageSquare, Upload, FileText, Send, Trash2, Menu, X, Globe } from 'lucide-react';
import { PreferenceProfile, LectureLab, ChatMessage } from './types';
import { generateLectureSummary, sendFollowUpMessage } from './services/geminiService';
import { cn } from './lib/utils';
import { translations, Language } from './i18n';

const DEFAULT_PROFILE: PreferenceProfile = {
  id: 'default',
  name: 'Default Smart Study Profile',
  targetLanguage: 'Arabic',
  simplifyExplanation: true,
  examStyle: true,
  highlightKeyPoints: true,
  simplifyTerms: true,
  generateQuestions: true,
  questionCount: 'Moderate',
  findVideos: true,
  customInstructions: '',
};

export default function App() {
  const [labs, setLabs] = useState<LectureLab[]>(() => {
    const saved = localStorage.getItem('lectureLabs');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeLabId, setActiveLabId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<PreferenceProfile[]>(() => {
    const saved = localStorage.getItem('preferenceProfiles');
    return saved ? JSON.parse(saved) : [DEFAULT_PROFILE];
  });
  const [activeProfileId, setActiveProfileId] = useState<string>(profiles[0].id);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [uiLanguage, setUiLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('uiLanguage');
    return (saved as Language) || 'ar';
  });

  const t = translations[uiLanguage];

  // Active Lab State
  const activeLab = labs.find((l) => l.id === activeLabId);
  const [lectureInput, setLectureInput] = useState('');
  const [fileInput, setFileInput] = useState<{data: string, mimeType: string, name: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatInput, setChatInput] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lab = labs.find(l => l.id === activeLabId);
    if (lab) {
      setLectureInput(lab.lectureContent || '');
      setFileInput(lab.fileData ? {
        data: lab.fileData,
        mimeType: lab.fileMimeType!,
        name: lab.fileName!
      } : null);
    } else {
      setLectureInput('');
      setFileInput(null);
    }
  }, [activeLabId]);

  useEffect(() => {
    const labsToSave = labs.map(({ fileData, fileMimeType, fileName, ...rest }) => rest);
    localStorage.setItem('lectureLabs', JSON.stringify(labsToSave));
  }, [labs]);

  useEffect(() => {
    localStorage.setItem('preferenceProfiles', JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem('uiLanguage', uiLanguage);
    document.documentElement.dir = uiLanguage === 'ar' ? 'rtl' : 'ltr';
  }, [uiLanguage]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeLab?.chatHistory]);

  const createNewLab = () => {
    const newLab: LectureLab = {
      id: uuidv4(),
      title: `${t.newLecturePrefix} ${labs.length + 1}`,
      createdAt: Date.now(),
      lectureContent: '',
      preferenceProfileId: activeProfileId,
      generatedResult: '',
      chatHistory: [],
    };
    setLabs([newLab, ...labs]);
    setActiveLabId(newLab.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteLab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLabs = labs.filter((l) => l.id !== id);
    setLabs(newLabs);
    if (activeLabId === id) {
      setActiveLabId(newLabs.length > 0 ? newLabs[0].id : null);
    }
  };

  const handleProcessLecture = async () => {
    if ((!lectureInput.trim() && !fileInput) || !activeLab) return;

    setIsProcessing(true);
    const profile = profiles.find((p) => p.id === activeProfileId) || DEFAULT_PROFILE;

    try {
      const result = await generateLectureSummary(lectureInput, profile, fileInput || undefined);
      const updatedLab = {
        ...activeLab,
        lectureContent: lectureInput,
        fileData: fileInput?.data,
        fileMimeType: fileInput?.mimeType,
        fileName: fileInput?.name,
        generatedResult: result,
        title: fileInput ? fileInput.name : (lectureInput.substring(0, 30) + '...'),
      };
      setLabs(labs.map((l) => (l.id === activeLab.id ? updatedLab : l)));
    } catch (error) {
      console.error('Failed to process lecture:', error);
      alert(t.processError);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeLab || isProcessing) return;

    const newMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: chatInput,
    };

    const updatedHistory = [...activeLab.chatHistory, newMessage];
    
    // Optimistic update
    setLabs(labs.map((l) => 
      l.id === activeLab.id ? { ...l, chatHistory: updatedHistory } : l
    ));
    setChatInput('');
    setIsProcessing(true);

    try {
      const response = await sendFollowUpMessage(
        activeLab.lectureContent,
        activeLab.generatedResult,
        updatedHistory,
        newMessage.content,
        activeLab.fileData ? { data: activeLab.fileData, mimeType: activeLab.fileMimeType! } : undefined
      );

      const modelMessage: ChatMessage = {
        id: uuidv4(),
        role: 'model',
        content: response,
      };

      setLabs(prevLabs => prevLabs.map((l) => 
        l.id === activeLab.id ? { ...l, chatHistory: [...updatedHistory, modelMessage] } : l
      ));
    } catch (error) {
      console.error('Failed to send message:', error);
      alert(t.sendError);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        alert(t.fileTooLarge);
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const base64Data = result.split(',')[1];
        setFileInput({
          data: base64Data,
          mimeType: file.type || 'application/octet-stream',
          name: file.name
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={cn(
      "flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200",
      uiLanguage === 'ar' ? 'font-arabic' : ''
    )} dir={uiLanguage === 'ar' ? 'rtl' : 'ltr'}>
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 z-30 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-300 ease-in-out",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-none"
        )}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <MessageSquare className="w-6 h-6" />
            {t.appName}
          </h1>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <button
            onClick={createNewLab}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            {t.newLab}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            {t.yourLabs}
          </h2>
          {labs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center mt-4">{t.noLabs}</p>
          ) : (
            labs.map((lab) => (
              <div
                key={lab.id}
                onClick={() => {
                  setActiveLabId(lab.id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={cn(
                  "group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                  activeLabId === lab.id
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{lab.title}</span>
                </div>
                <button
                  onClick={(e) => deleteLab(lab.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <button
            onClick={() => setUiLanguage(uiLanguage === 'ar' ? 'en' : 'ar')}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            <Globe className="w-5 h-5" />
            <span className="text-sm font-medium">{uiLanguage === 'ar' ? 'English' : 'العربية'}</span>
          </button>
          <button
            onClick={() => setShowPreferencesModal(true)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span className="text-sm font-medium">{t.preferences}</span>
          </button>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-sm font-medium">{isDarkMode ? t.lightMode : t.darkMode}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={cn("p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300", uiLanguage === 'ar' ? '-mr-2' : '-ml-2')}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold truncate">
              {activeLab ? activeLab.title : t.welcome}
            </h2>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {!activeLab ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-4">
                <MessageSquare className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold">{t.appName}</h2>
              <p className="text-gray-500 dark:text-gray-400">
                {t.welcomeDesc}
              </p>
              <button
                onClick={createNewLab}
                className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-xl font-medium shadow-lg shadow-blue-600/20 transition-all active:scale-95"
              >
                {t.createFirst}
              </button>
            </div>
          ) : !activeLab.generatedResult ? (
            <div className="max-w-3xl mx-auto space-y-6 h-full flex flex-col">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 flex-1 flex flex-col">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-500" />
                  {t.uploadLecture}
                </h3>
                
                <div className="mb-4 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t.selectProfile}
                  </label>
                  <select
                    value={activeProfileId}
                    onChange={(e) => setActiveProfileId(e.target.value)}
                    className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.id === 'default' ? t.defaultProfileName : p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 relative flex flex-col gap-4">
                  <textarea
                    value={lectureInput}
                    onChange={(e) => setLectureInput(e.target.value)}
                    placeholder={t.pastePlaceholder}
                    className="w-full flex-1 min-h-[200px] p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  
                  {fileInput ? (
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                        <span className="truncate text-sm font-medium text-blue-700 dark:text-blue-300">
                          {fileInput.name}
                        </span>
                      </div>
                      <button
                        onClick={() => setFileInput(null)}
                        className="p-1.5 text-blue-500 hover:text-red-500 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-start">
                      <label className="cursor-pointer bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm font-medium">
                        <Upload className="w-4 h-4" />
                        {t.uploadAnyFile}
                        <input 
                          type="file" 
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" 
                          className="hidden" 
                          onChange={handleFileUpload} 
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleProcessLecture}
                    disabled={isProcessing || (!lectureInput.trim() && !fileInput)}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white py-3 px-8 rounded-xl font-medium shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t.processing}
                      </>
                    ) : (
                      <>
                        {t.generateGuide}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto flex flex-col h-full">
              <div className="flex-1 overflow-y-auto space-y-6 pb-24">
                {/* Initial Summary */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-200 dark:border-gray-700 prose prose-blue dark:prose-invert max-w-none">
                  <Markdown remarkPlugins={[remarkGfm]}>{activeLab.generatedResult}</Markdown>
                </div>

                {/* Chat History */}
                {activeLab.chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex w-full",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] md:max-w-[75%] rounded-2xl p-4",
                        msg.role === 'user'
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm prose prose-blue dark:prose-invert"
                      )}
                    >
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap m-0">{msg.content}</p>
                      ) : (
                        <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                      )}
                    </div>
                  </div>
                ))}
                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-sm p-4 flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent dark:from-gray-900 dark:via-gray-900 z-10">
                <div className="max-w-4xl mx-auto relative">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={t.askFollowUp}
                    className={cn(
                      "w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-2xl py-4 shadow-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-14 min-h-[56px] max-h-32 overflow-y-auto",
                      uiLanguage === 'ar' ? 'pr-4 pl-14' : 'pl-4 pr-14'
                    )}
                    rows={1}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isProcessing || !chatInput.trim()}
                    className={cn(
                      "absolute bottom-2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl transition-colors",
                      uiLanguage === 'ar' ? 'left-2' : 'right-2'
                    )}
                  >
                    <Send className={cn("w-5 h-5", uiLanguage === 'ar' ? 'rotate-180' : '')} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Preferences Modal */}
      {showPreferencesModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                {t.preferences}
              </h2>
              <button onClick={() => setShowPreferencesModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Profile Selector */}
              <div className="flex items-center gap-4">
                <label className="font-medium">{t.activeProfile}</label>
                <select
                  value={activeProfileId}
                  onChange={(e) => setActiveProfileId(e.target.value)}
                  className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-2"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.id === 'default' ? t.defaultProfileName : p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const newProfile = { ...DEFAULT_PROFILE, id: uuidv4(), name: `Profile ${profiles.length + 1}` };
                    setProfiles([...profiles, newProfile]);
                    setActiveProfileId(newProfile.id);
                  }}
                  className="p-2 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800"
                  title="Create New Profile"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Profile Settings */}
              {profiles.find(p => p.id === activeProfileId) && (() => {
                const profile = profiles.find(p => p.id === activeProfileId)!;
                const updateProfile = (updates: Partial<PreferenceProfile>) => {
                  setProfiles(profiles.map(p => p.id === profile.id ? { ...p, ...updates } : p));
                };

                return (
                  <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">{t.profileName}</label>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e) => updateProfile({ name: e.target.value })}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-2"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">{t.targetLang}</label>
                      <input
                        type="text"
                        value={profile.targetLanguage}
                        onChange={(e) => updateProfile({ targetLanguage: e.target.value })}
                        placeholder={t.targetLangPlaceholder}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-2"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <input
                          type="checkbox"
                          checked={profile.simplifyExplanation}
                          onChange={(e) => updateProfile({ simplifyExplanation: e.target.checked })}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium">{t.simplifyExp}</span>
                      </label>

                      <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <input
                          type="checkbox"
                          checked={profile.examStyle}
                          onChange={(e) => updateProfile({ examStyle: e.target.checked })}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium">{t.examStyle}</span>
                      </label>

                      <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <input
                          type="checkbox"
                          checked={profile.highlightKeyPoints}
                          onChange={(e) => updateProfile({ highlightKeyPoints: e.target.checked })}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium">{t.highlightKeys}</span>
                      </label>

                      <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <input
                          type="checkbox"
                          checked={profile.simplifyTerms}
                          onChange={(e) => updateProfile({ simplifyTerms: e.target.checked })}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium">{t.simplifyTerms}</span>
                      </label>

                      <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <input
                          type="checkbox"
                          checked={profile.findVideos}
                          onChange={(e) => updateProfile({ findVideos: e.target.checked })}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium">{t.suggestVideos}</span>
                      </label>
                    </div>

                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={profile.generateQuestions}
                          onChange={(e) => updateProfile({ generateQuestions: e.target.checked })}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="font-medium">{t.genQuestions}</span>
                      </label>
                      
                      {profile.generateQuestions && (
                        <div className={cn("pl-8", uiLanguage === 'ar' ? 'pr-8 pl-0' : '')}>
                          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t.questionCount}</label>
                          <input
                            type="text"
                            value={profile.questionCount}
                            onChange={(e) => updateProfile({ questionCount: e.target.value })}
                            placeholder={t.questionCountPlaceholder}
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">{t.customInst}</label>
                      <textarea
                        value={profile.customInstructions}
                        onChange={(e) => updateProfile({ customInstructions: e.target.value })}
                        placeholder={t.customInstPlaceholder}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-2 min-h-[100px] resize-y"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
              <button
                onClick={() => setShowPreferencesModal(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-medium transition-colors"
              >
                {t.saveClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

