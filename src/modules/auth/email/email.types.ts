export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  /** False when this process cannot send. Must not throw. */
  isConfigured(): boolean;
  send(message: OutboundEmail): Promise<void>;
}

export type EmailFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
