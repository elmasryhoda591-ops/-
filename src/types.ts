export interface PreferenceProfile {
  id: string;
  name: string;
  targetLanguage: string;
  simplifyExplanation: boolean;
  examStyle: boolean;
  highlightKeyPoints: boolean;
  simplifyTerms: boolean;
  generateQuestions: boolean;
  questionCount: string;
  findVideos: boolean;
  customInstructions: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

export interface LectureLab {
  id: string;
  title: string;
  createdAt: number;
  lectureContent: string;
  fileData?: string;
  fileMimeType?: string;
  fileName?: string;
  preferenceProfileId: string;
  generatedResult: string;
  chatHistory: ChatMessage[];
}
