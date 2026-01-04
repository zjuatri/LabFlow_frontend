import { getToken } from './auth';
import { streamChat, type AiStreamEvent } from './stream';

// In production/Docker we typically proxy /api/* through the same origin.
// For local dev, set NEXT_PUBLIC_BACKEND_URL=http://localhost:8000.
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let detail = 'Request failed';
    try {
      const data = await res.json();
      if (data?.detail) {
        detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  // 204 No Content (or empty body) should not be parsed as JSON.
  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  // For binary endpoints callers should not use this helper.
  return JSON.parse(text) as T;
}

// 带超时的请求函数，用于可能耗时较长的 AI 请求
async function requestWithTimeout<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = 120000 // 默认 120 秒
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await request<T>(path, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    throw error;
  }
}

export type TokenResponse = { access_token: string; token_type: 'bearer' };
export type Project = {
  id: string;
  title: string;
  type: string;
  typst_code: string;
  created_at: string;
  updated_at: string;
};

export type PromptResponse = { ai_prompt: string; updated_at?: string | null };
// Redundant type moved below with additional fields

export async function register(email: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function listProjects(type?: string): Promise<Project[]> {
  const params = type ? `?type=${type}` : '';
  return request<Project[]>(`/api/projects${params}`);
}

export async function createProject(title: string, type: string = 'report', sourceProjectId?: string): Promise<Project> {
  return request<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ title, type, source_project_id: sourceProjectId }),
  });
}

export async function getProject(id: string): Promise<Project> {
  return request<Project>(`/api/projects/${id}`);
}

export async function updateProject(id: string, updates: { title?: string; typst_code?: string; type?: string }): Promise<Project> {
  return request<Project>(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await request<unknown>(`/api/projects/${id}`, {
    method: 'DELETE',
  });
}

export type DeepSeekChatResponse = {
  response: string;
  model: string;
  thought?: string | null;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  } | null;
};

export type ProjectImageSummary = {
  filename: string;
  url: string;
  page?: number | null;
  summary: string;
};

export type ImagesSummarizeResponse = {
  project_id: string;
  model: string;
  summaries: ProjectImageSummary[];
};

export async function summarizeProjectImages(
  projectId: string,
  payload: { images?: Array<{ filename: string; url?: string; page?: number | null }>; max_images?: number; model?: string } = {}
): Promise<ImagesSummarizeResponse> {
  return requestWithTimeout<ImagesSummarizeResponse>(`/api/projects/${encodeURIComponent(projectId)}/images/summarize`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 180000);
}

export async function chatWithDeepSeek(
  message: string,
  model: string = 'deepseek-v3',
  thinking: boolean = false
): Promise<DeepSeekChatResponse> {
  // 使用带超时的请求，AI 请求可能需要较长时间
  // 这里走 Next Route Handler（app/api/ai/chat/route.ts），避免 rewrites 代理导致的 ECONNRESET
  return requestWithTimeout<DeepSeekChatResponse>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, model, thinking }),
  }, 120000); // 120 秒超时
}

export async function chatWithDeepSeekStream(
  message: string,
  model: string,
  thinking: boolean,
  onEvent: (evt: AiStreamEvent) => void
): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  await streamChat(
    '/api/ai/chat',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, model, thinking, stream: true }),
    },
    onEvent
  );
}

export type PromptsResponse = {
  ai_prompt: string;
  ai_assistant_prompt: string;
  pdf_page_ocr_prompt: string;
  table_cell_ocr_prompt: string;
  updated_at?: string | null;
};

export async function getManagePrompt(): Promise<PromptResponse> {
  return request<PromptResponse>('/api/manage/prompt');
}

export async function getAssistantPrompt(): Promise<PromptResponse> {
  return request<PromptResponse>('/api/manage/assistant-prompt');
}

export async function updateManagePrompt(ai_prompt: string): Promise<PromptResponse> {
  return request<PromptResponse>('/api/manage/prompt', {
    method: 'PUT',
    body: JSON.stringify({ ai_prompt }),
  });
}

export async function getManagePrompts(): Promise<PromptsResponse> {
  return request<PromptsResponse>('/api/manage/prompts');
}

export async function updateManagePrompts(payload: {
  ai_prompt?: string;
  ai_assistant_prompt?: string;
  pdf_page_ocr_prompt?: string;
  table_cell_ocr_prompt?: string;
}): Promise<PromptsResponse> {
  return request<PromptsResponse>('/api/manage/prompts', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ------------------------------------------------------------------
// Documents API
// ------------------------------------------------------------------

export type Document = {
  id: string;
  slug: string;
  title: string;
  content: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export async function listDocuments(publishedOnly: boolean = true): Promise<Document[]> {
  // Not implemented for FS yet, or could scan all. 
  // For now, return empty or implement a flat list scan if needed.
  // But manage page uses getSidebarStructure.
  return [];
}

export async function getDocument(slug: string): Promise<Document> {
  // Use internal API
  const res = await fetch(`/api/fs/doc/${slug}`);
  if (!res.ok) throw new Error('Failed to fetch document');
  return res.json();
}

export async function createDocument(payload: {
  slug: string;
  title: string;
  content: string;
  is_published?: boolean;
  isFolder?: boolean;
  parentPath?: string;
}): Promise<Document> {
  const res = await fetch('/api/fs/doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create document');
  }
  return res.json();
}

export async function updateDocument(
  id: string,
  payload: {
    slug?: string;
    title?: string;
    content?: string;
    is_published?: boolean;
    newPath?: string; // For renaming/moving
  }
): Promise<Document> {
  const res = await fetch('/api/fs/doc', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        oldPath: id,
        newPath: payload.newPath || payload.slug, // Use slug as new path if provided
        title: payload.title,
        content: payload.content
    }),
  });
  if (!res.ok) throw new Error('Failed to update document');
  return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
    const res = await fetch('/api/fs/doc', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: id }),
    });
    if (!res.ok) throw new Error('Failed to delete document');
}


export type NavItem = {
  title: string;
  url?: string;
  slug?: string;
  path?: string;
  items?: NavItem[];
};

export async function getSidebarStructure(): Promise<NavItem[]> {
  const res = await fetch('/api/fs/structure');
  if (!res.ok) throw new Error('Failed to fetch structure');
  return res.json();
}

export async function updateSidebarStructure(structure: NavItem[]): Promise<void> {
  const res = await fetch('/api/fs/structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(structure),
  });
  if (!res.ok) throw new Error('Failed to update structure');
}




