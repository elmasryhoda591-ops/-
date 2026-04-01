import { GoogleGenAI } from "@google/genai";
import { PreferenceProfile, ChatMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateLectureSummary(
  lectureText: string,
  profile: PreferenceProfile,
  file?: { data: string; mimeType: string }
): Promise<string> {
  const prompt = `
You are a "Smart Lecture Study Assistant". Your goal is to process the following lecture according to the user's specific preferences.

User Preferences:
- Target Language: ${profile.targetLanguage || 'Original Language'}
- Simplify Explanation: ${profile.simplifyExplanation ? 'Yes, explain in a simple, easy-to-understand way focusing on main ideas.' : 'No, keep original complexity.'}
- Exam Style: ${profile.examStyle ? 'Yes, structure the explanation to match university/school exam systems.' : 'No.'}
- Highlight Key Points: ${profile.highlightKeyPoints ? 'Yes, filter and arrange information, highlighting the most important points and common exam questions.' : 'No.'}
- Simplify Terms: ${profile.simplifyTerms ? 'Yes, explain complex terms and vocabulary very simply for a student.' : 'No.'}
- Generate Questions: ${profile.generateQuestions ? 'Yes, generate questions and examples matching the exam system. Quantity: ' + (profile.questionCount || 'Moderate') + '. Focus on frequently asked questions.' : 'No.'}
- Find Videos/Applications: ${profile.findVideos ? 'Yes, if there are practical applications, suggest YouTube video titles or search terms for these applications.' : 'No.'}
- Custom Instructions: ${profile.customInstructions || 'None'}

Lecture Content:
---
${lectureText || 'No text provided, see attached file.'}
---

Please process the lecture and provide the output formatted cleanly in Markdown. Ensure all requested features are clearly separated by headings.
`;

  const parts: any[] = [];
  if (file) {
    parts.push({
      inlineData: {
        data: file.data,
        mimeType: file.mimeType,
      },
    });
  }
  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: { parts },
    });
    return response.text || "No response generated.";
  } catch (error) {
    console.error("Error generating summary:", error);
    throw error;
  }
}

export async function sendFollowUpMessage(
  lectureText: string,
  initialSummary: string,
  chatHistory: ChatMessage[],
  newMessage: string,
  file?: { data: string; mimeType: string }
): Promise<string> {
  let fullPrompt = `System: You are a helpful study assistant. Answer the user's follow-up question based on the lecture and previous summary.\n\n`;
  if (lectureText) {
    fullPrompt += `Original Lecture:\n${lectureText}\n\n`;
  }
  fullPrompt += `Initial Summary:\n${initialSummary}\n\n`;
  fullPrompt += `Chat History:\n`;
  chatHistory.forEach(msg => {
    fullPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
  });
  fullPrompt += `User: ${newMessage}\nAssistant:`;

  const parts: any[] = [];
  if (file) {
    parts.push({
      inlineData: {
        data: file.data,
        mimeType: file.mimeType,
      },
    });
  }
  parts.push({ text: fullPrompt });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: { parts },
    });
    return response.text || "No response generated.";
  } catch (error) {
    console.error("Error sending follow-up:", error);
    throw error;
  }
}
