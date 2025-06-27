import { Injectable } from '@nestjs/common';
import { familiarConfig } from './familiar.config';

@Injectable()
export class FamiliarEngineService {
  getSummarizePrompt(note: string): string {
    return `
You are a wise, poetic familiar. Summarize the following journal entry in 2–3 sentences.
Then, reflect gently on its emotional tone or hidden meaning. Be subtle and kind.

Journal Entry:
${note}
`;
  }

  getWeeklyDigestPrompt(notes: string[]): string {
    const formatted = notes.map((n, i) => `Entry ${i + 1}:\n${n}`).join('\n\n');

    return `
You are an introspective familiar reflecting on a week of thoughts.

Look at the following journal entries. Identify themes, emotional patterns, and offer one piece of reflective wisdom.

Journal Entries:
${formatted}
`;
  }

  getFreeformPrompt(userInput: string, familiarName: string): string {
    const familiar = familiarConfig[familiarName];

    if (!familiar) {
      throw new Error(`Unknown familiar: ${familiarName}`);
    }

    return `
${familiar.systemPrompt.trim()}

The user seeks your insight. They say:

"${userInput}"

Respond in your characteristic tone with helpful guidance, reflection, or challenge.
`;
  }

  getChatExportPrompt(dialogue: string[]): string {
    const formatted = dialogue
      .map((line, i) => `${i + 1}. ${line}`)
      .join('\n');
  
    return `
  Below is a dialogue between a user and their familiar.
  
  Please distill this conversation into a single short reflection — as if the user is writing a journal entry that captures the essence of what was discovered.
  
  Be concise, thoughtful, and keep the tone poetic and personal.
  
  Conversation:
  ${formatted}
  `;
  }
  
}
